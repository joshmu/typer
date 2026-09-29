import type { SimEvent } from "../sim/events";
import { createInitialState, type GameState } from "../sim/state";
import { type GameEvent, step } from "../sim/step";
import { createFixedStepClock } from "./clock";

/** Draws a run. `events` holds every sim event since the previous draw. */
export type RunRenderer = {
	draw(state: GameState, events: readonly SimEvent[]): void;
	isReady(): boolean;
	dispose(): void;
};

export type RunSessionOptions = {
	seed: number;
	renderer: RunRenderer;
	/** Wall-clock milliseconds, e.g. `performance.now`. */
	now(): number;
	/** Step one tick and draw on every input instead of on frames (test mode). */
	stepOnInput: boolean;
	onState(state: GameState): void;
};

/** One run: the sim state, its queued input, the real-time clock and the renderer. */
export type RunSession = {
	pushKey(key: string): void;
	/** Release the active target (Backspace), keeping all typed progress. */
	pushBackspace(): void;
	/** Pick perk card `index` (0|1|2) during the perk-choice overlay. */
	pushPerk(index: number): void;
	stepTicks(n: number): void;
	/** One real-time frame: advance by the clock while running, then draw. */
	frame(): void;
	draw(): void;
	/** Paused sessions still draw each frame but never advance the sim. */
	setRunning(running: boolean): void;
	getState(): GameState;
	renderReady(): boolean;
	dispose(): void;
};

export function createRunSession(opts: RunSessionOptions): RunSession {
	const { renderer } = opts;
	const clock = createFixedStepClock(opts.now());
	let state = createInitialState(opts.seed);
	let pending: GameEvent[] = [];
	// sim events from every tick since the last draw
	const frameEvents: SimEvent[] = [];
	let running = opts.stepOnInput;

	function advance(ticks: number) {
		for (let i = 0; i < ticks; i++) {
			state = step(state, pending, frameEvents);
			pending = [];
		}
	}

	function draw() {
		renderer.draw(state, frameEvents);
		frameEvents.length = 0;
		opts.onState(state);
	}

	function push(ev: GameEvent) {
		pending.push(ev);
		if (opts.stepOnInput) {
			advance(1);
			draw();
		}
	}

	return {
		pushKey: (key) => push({ type: "key", key }),
		pushBackspace: () => push({ type: "backspace" }),
		pushPerk: (index) => push({ type: "perk", index }),
		stepTicks(n) {
			advance(n);
			draw();
		},
		frame() {
			// keep the clock current while paused so resuming never replays the
			// time spent behind an overlay
			if (running) advance(clock.advance(opts.now()));
			else clock.reset(opts.now());
			draw();
		},
		draw,
		setRunning(next) {
			if (next && !running) clock.reset(opts.now());
			running = next;
		},
		getState: () => state,
		renderReady: () => renderer.isReady(),
		dispose: () => renderer.dispose(),
	};
}
