import type { GameState } from "../sim/state";
import { createInitialState } from "../sim/state";
import { type GameEvent, step } from "../sim/step";
import { createEnemyRenderer } from "./enemy-renderer";
import { createGameScene } from "./scene";

const TICK_MS = 1000 / 60;
const MAX_CATCHUP_TICKS = 30; // degraded-tab guard: drop time instead of spiraling

export type GameLoopOptions = {
	canvas: HTMLCanvasElement;
	seed: number;
	testMode: boolean;
	onState(state: GameState): void;
};

export type GameLoop = {
	pushKey(key: string): void;
	stepTicks(n: number): void;
	getState(): GameState;
	dispose(): void;
};

export function startGameLoop(opts: GameLoopOptions): GameLoop {
	const gameScene = createGameScene(opts.canvas, {
		preserveDrawingBuffer: opts.testMode,
	});
	const enemies = createEnemyRenderer(gameScene.scene);
	let state = createInitialState(opts.seed);
	let pending: GameEvent[] = [];
	let accumulator = 0;
	let lastTime = performance.now();

	function advance(ticks: number) {
		for (let i = 0; i < ticks; i++) {
			state = step(state, pending);
			pending = [];
		}
	}

	function render() {
		enemies.sync(state);
		opts.onState(state);
		gameScene.scene.render();
	}

	if (!opts.testMode) {
		gameScene.engine.runRenderLoop(() => {
			const now = performance.now();
			accumulator += now - lastTime;
			lastTime = now;
			let ticks = Math.floor(accumulator / TICK_MS);
			accumulator -= ticks * TICK_MS;
			if (ticks > MAX_CATCHUP_TICKS) ticks = MAX_CATCHUP_TICKS;
			advance(ticks);
			render();
		});
	} else {
		render(); // single deterministic frame; tests drive via stepTicks
	}

	return {
		pushKey(key: string) {
			pending.push({ type: "key", key });
			if (opts.testMode) {
				advance(1);
				render();
			}
		},
		stepTicks(n: number) {
			advance(n);
			render();
		},
		getState: () => state,
		dispose() {
			gameScene.engine.stopRenderLoop();
			enemies.dispose();
			gameScene.dispose();
		},
	};
}
