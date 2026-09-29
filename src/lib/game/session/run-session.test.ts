import { describe, expect, it } from "vitest";
import { stateHash } from "../sim/replay";
import { createInitialState, currentWord, type GameState } from "../sim/state";
import { step } from "../sim/step";
import { MAX_CATCHUP_TICKS, TICK_MS } from "./clock";
import { createNullRenderer } from "./null-renderer";
import { createRunSession } from "./run-session";

const SEED = 42;
const FIRST_SPAWN_TICKS = 181;

/** A session on the null renderer with a hand-driven wall clock. */
function setup(stepOnInput = false) {
	let t = 1000;
	const renderer = createNullRenderer();
	const states: GameState[] = [];
	const session = createRunSession({
		seed: SEED,
		renderer,
		now: () => t,
		stepOnInput,
		onState: (s) => states.push(s),
	});
	/** Let `ms` of wall time pass without a frame. */
	const elapse = (ms: number) => {
		t += ms;
	};
	/** Let `ms` of wall time pass, then run one frame. */
	const frameAfter = (ms: number) => {
		elapse(ms);
		session.frame();
	};
	return { session, renderer, states, elapse, frameAfter };
}

/** The word the player would type next: the locked target's, else the first enemy's. */
function nextWord(s: GameState): string | undefined {
	const e = s.enemies.find((x) => x.id === s.targetId) ?? s.enemies[0];
	return e ? currentWord(e).slice(e.typedCount) : undefined;
}

describe("RunSession (headless, null renderer)", () => {
	it("draws the initial state without stepping", () => {
		const { session, renderer, states } = setup();
		session.draw();
		expect(session.getState().tick).toBe(0);
		expect(renderer.frames).toBe(1);
		expect(states.at(-1)).toBe(session.getState());
	});

	it("queues keys for the next tick and matches stepping the sim directly", () => {
		const { session, frameAfter } = setup();
		session.setRunning(true);
		session.stepTicks(FIRST_SPAWN_TICKS);
		const word = nextWord(session.getState());
		expect(word).toBeTruthy();
		for (const k of word as string) session.pushKey(k);
		// queued input waits for a tick
		expect(session.getState().tick).toBe(FIRST_SPAWN_TICKS);
		frameAfter(TICK_MS * 3 + 1);

		let expected = createInitialState(SEED);
		for (let i = 0; i < FIRST_SPAWN_TICKS; i++) expected = step(expected, []);
		expected = step(
			expected,
			[...(word as string)].map((key) => ({ type: "key" as const, key })),
		);
		expected = step(step(expected, []), []);
		expect(session.getState().tick).toBe(FIRST_SPAWN_TICKS + 3);
		expect(stateHash(session.getState())).toBe(stateHash(expected));
	});

	it("backspace releases the locked target", () => {
		const { session } = setup(true);
		session.stepTicks(FIRST_SPAWN_TICKS);
		const word = nextWord(session.getState()) as string;
		session.pushKey(word[0]);
		expect(session.getState().targetId).not.toBeNull();
		session.pushBackspace();
		expect(session.getState().targetId).toBeNull();
	});

	it("hands each tick's sim events to the renderer once", () => {
		const { session, renderer } = setup(true);
		session.stepTicks(FIRST_SPAWN_TICKS);
		const word = nextWord(session.getState()) as string;
		session.pushKey(word[0]);
		expect(renderer.lastEvents).toContainEqual(
			expect.objectContaining({ type: "hit", typed: true }),
		);
		session.stepTicks(1);
		expect(renderer.lastEvents).toEqual([]);
	});

	it("plays through a wave clear and applies a perk choice", () => {
		const { session } = setup(true);
		for (let i = 0; i < 2000; i++) {
			const s = session.getState();
			if (s.wavePhase === "perk-choice" || s.status === "gameover") break;
			const word = nextWord(s);
			if (word) session.pushKey(word[0]);
			else session.stepTicks(1);
		}
		const s = session.getState();
		expect(s.status).not.toBe("gameover");
		expect(s.wavePhase).toBe("perk-choice");
		const pick = s.perkOffer?.[1];
		session.pushPerk(1);
		expect(session.getState().perks).toEqual([pick]);
		expect(session.getState().wavePhase).toBe("intermission");
	});

	it("catches up at most 30 ticks after a long stall", () => {
		const { session, frameAfter } = setup();
		session.setRunning(true);
		frameAfter(1005);
		expect(session.getState().tick).toBe(MAX_CATCHUP_TICKS);
		// the stalled time past the cap is dropped, not replayed
		frameAfter(TICK_MS + 1);
		expect(session.getState().tick).toBe(MAX_CATCHUP_TICKS + 1);
	});

	it("holds the sim while paused and never replays the paused time", () => {
		const { session, renderer, frameAfter } = setup();
		session.setRunning(false);
		frameAfter(5000);
		frameAfter(5000);
		expect(session.getState().tick).toBe(0);
		// paused frames still draw, so the scene stays visible behind overlays
		expect(renderer.frames).toBe(2);
		session.setRunning(true);
		frameAfter(0);
		expect(session.getState().tick).toBe(0);
		frameAfter(TICK_MS * 2 + 1);
		expect(session.getState().tick).toBe(2);
	});

	it("resuming mid-run discards time accrued while paused", () => {
		const { session, frameAfter } = setup();
		session.setRunning(true);
		frameAfter(TICK_MS * 4 + 1);
		expect(session.getState().tick).toBe(4);
		session.setRunning(false);
		frameAfter(3000);
		session.setRunning(true);
		frameAfter(TICK_MS + 1);
		expect(session.getState().tick).toBe(5);
	});

	it("resuming discards paused time even with no frame while paused", () => {
		const { session, elapse, frameAfter } = setup();
		session.setRunning(true);
		frameAfter(TICK_MS * 4 + 1);
		session.setRunning(false);
		elapse(3000);
		session.setRunning(true);
		frameAfter(TICK_MS + 1);
		expect(session.getState().tick).toBe(5);
	});

	it("steps one tick per input in step-on-input mode", () => {
		const { session, renderer } = setup(true);
		session.pushKey("z");
		expect(session.getState().tick).toBe(1);
		expect(renderer.frames).toBe(1);
	});

	it("dispose releases the renderer", () => {
		const { session, renderer } = setup();
		session.dispose();
		expect(renderer.disposed).toBe(true);
	});
});
