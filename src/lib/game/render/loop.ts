import type { GameState } from "../sim/state";
import { createInitialState } from "../sim/state";
import { type GameEvent, step } from "../sim/step";
import { createEffects } from "./effects";
import { createEnemyRenderer } from "./enemy-renderer";
import { createPowerupRenderer } from "./powerup-renderer";
import { createGameScene } from "./scene";
import { visualFor } from "./visuals";

const TICK_MS = 1000 / 60;
const MAX_CATCHUP_TICKS = 30; // degraded-tab guard: drop time instead of spiraling
// a vanished enemy whose last-seen position was this close to the origin, in a
// frame where the core also lost hp, breached the core — it was not typed to
// death, so it gets the hit shake but no kill burst. Sits just above
// ARENA.killRadius (1.2) to absorb the sub-tick of travel before it was pruned.
const BREACH_RADIUS = 2;

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
	renderReady(): boolean;
	dispose(): void;
};

export function startGameLoop(opts: GameLoopOptions): GameLoop {
	const gameScene = createGameScene(opts.canvas, {
		preserveDrawingBuffer: opts.testMode,
	});
	const enemies = createEnemyRenderer(gameScene.scene);
	const powerups = createPowerupRenderer(gameScene.scene);
	const effects = createEffects(gameScene.scene);
	let state = createInitialState(opts.seed);
	let pending: GameEvent[] = [];
	let accumulator = 0;
	let lastTime = performance.now();

	// render-side event derivation: the sim keeps no event log, so we diff the
	// set of live enemies between frames to fire death bursts, and watch playerHp
	// for hit shakes. Entries are mutated in place to avoid per-frame allocation.
	type Seen = {
		x: number;
		y: number;
		color: [number, number, number];
		seen: boolean;
	};
	const lastSeen = new Map<number, Seen>();
	let lastPlayerHp = state.playerHp;

	function advance(ticks: number) {
		for (let i = 0; i < ticks; i++) {
			state = step(state, pending);
			pending = [];
		}
	}

	function deriveEffects() {
		for (const info of lastSeen.values()) info.seen = false;
		for (const e of state.enemies) {
			const info = lastSeen.get(e.id);
			if (info) {
				info.x = e.pos.x;
				info.y = e.pos.y;
				info.seen = true;
			} else {
				// an enemy id maps to a fixed archetype for its whole lifetime, so
				// its family color never changes — resolve it once at insert. Copy
				// the tuple's values rather than aliasing the shared FAMILY_VISUALS
				// array, so nothing downstream can mutate the recipe.
				const [r, g, b] = visualFor(e.archetypeId).color;
				lastSeen.set(e.id, {
					x: e.pos.x,
					y: e.pos.y,
					color: [r, g, b],
					seen: true,
				});
			}
		}
		// hp lost this frame is attributable to core breaches — enemies that
		// reached the origin rather than being typed to death. Attribute each drop
		// to the nearest vanished enemy so its disappearance reads as a hit (shake),
		// not a kill (burst).
		let breachesToAttribute = lastPlayerHp - state.playerHp;
		for (const [id, info] of lastSeen) {
			if (!info.seen) {
				const breached =
					breachesToAttribute > 0 &&
					Math.hypot(info.x, info.y) <= BREACH_RADIUS;
				if (breached) {
					breachesToAttribute -= 1; // core hit, not a kill: no burst
				} else {
					effects.deathBurst(info, info.color);
				}
				lastSeen.delete(id);
			}
		}
		if (state.playerHp < lastPlayerHp) effects.playerHit();
		lastPlayerHp = state.playerHp;
	}

	function render() {
		deriveEffects();
		effects.update(state);
		enemies.sync(state);
		powerups.sync(state);
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
		// whole scene ready to draw — async PNG textures decoded AND their material
		// shader variants compiled. Lets tests gate the deterministic frame so it
		// never captures a mesh Babylon skipped while its effect was still building.
		renderReady: () => gameScene.scene.isReady(),
		dispose() {
			gameScene.engine.stopRenderLoop();
			effects.dispose();
			enemies.dispose();
			powerups.dispose();
			gameScene.dispose();
		},
	};
}
