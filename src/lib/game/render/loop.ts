import { Vector3 } from "@babylonjs/core/Maths/math";
import type { GameState } from "../sim/state";
import { createInitialState } from "../sim/state";
import { type GameEvent, step } from "../sim/step";
import { createEffects } from "./effects";
import { createEnemyRenderer } from "./enemy-renderer";
import { createPowerupRenderer } from "./powerup-renderer";
import { createGameScene } from "./scene";
import { createTurret } from "./turret";
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
	setRunning(running: boolean): void;
	getState(): GameState;
	renderReady(): boolean;
	dispose(): void;
};

export function startGameLoop(opts: GameLoopOptions): GameLoop {
	const gameScene = createGameScene(opts.canvas, {
		preserveDrawingBuffer: opts.testMode,
	});
	const enemies = createEnemyRenderer(gameScene.scene, gameScene.glow);
	const powerups = createPowerupRenderer(gameScene.scene, gameScene.glow);
	const effects = createEffects(gameScene.scene);
	const turret = createTurret(gameScene.scene);
	// scratch vectors reused every frame — the hot path allocates nothing
	const muzzle = new Vector3();
	const shotTo = new Vector3();
	let state = createInitialState(opts.seed);
	let pending: GameEvent[] = [];
	let accumulator = 0;
	let lastTime = performance.now();
	// while false the rAF loop keeps rendering (so the scene is visible behind the
	// start overlay) but does not advance the sim. Real sessions begin paused and
	// resume on the first keypress; testMode drives ticks directly via stepTicks.
	let running = opts.testMode;

	// render-side event derivation: the sim keeps no event log, so we diff the
	// set of live enemies between frames to fire death bursts, and watch playerHp
	// for hit shakes. Entries are mutated in place to avoid per-frame allocation.
	type Seen = {
		x: number;
		y: number;
		color: [number, number, number];
		typedCount: number;
		hp: number;
		seen: boolean;
	};
	const lastSeen = new Map<number, Seen>();
	let lastPlayerHp = state.playerHp;
	// powerup-activation watch: a rise in a status timer, a heal, or a typed-out
	// pickup vanishing all read as "player triggered a powerup" → ring pulse
	let lastFreeze = state.freezeTicksLeft;
	let lastSlow = state.slowTicksLeft;
	let lastTargetPowerupId = state.targetPowerupId;

	function advance(ticks: number) {
		for (let i = 0; i < ticks; i++) {
			state = step(state, pending);
			pending = [];
		}
	}

	function deriveEffects() {
		// muzzle reflects the turret's CURRENT facing (updated earlier this frame)
		turret.getMuzzle(muzzle);
		for (const info of lastSeen.values()) info.seen = false;
		for (const e of state.enemies) {
			const info = lastSeen.get(e.id);
			if (info) {
				// a keystroke landed on this enemy this frame → visible shot; a hp
				// drop means the word was completed → heavier bolt + muzzle flash
				const typed = e.typedCount > info.typedCount;
				const damaged = e.hp < info.hp;
				if (damaged || typed) {
					shotTo.set(e.pos.x, 1, e.pos.y);
					effects.fireTracer(muzzle, shotTo, damaged);
					if (damaged) effects.muzzleFlash(muzzle, true);
				}
				info.x = e.pos.x;
				info.y = e.pos.y;
				info.typedCount = e.typedCount;
				info.hp = e.hp;
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
					typedCount: e.typedCount,
					hp: e.hp,
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
					// a typed-to-death enemy: final bolt + muzzle flash, then burst
					shotTo.set(info.x, 1, info.y);
					effects.fireTracer(muzzle, shotTo, true);
					effects.muzzleFlash(muzzle, true);
					effects.deathBurst(info, info.color);
				}
				lastSeen.delete(id);
			}
		}
		if (state.playerHp < lastPlayerHp) effects.playerHit();

		// powerup activation → radial ring pulse from the turret
		const consumed =
			lastTargetPowerupId !== null &&
			!state.powerups.some((p) => p.id === lastTargetPowerupId);
		if (
			state.freezeTicksLeft > lastFreeze ||
			state.slowTicksLeft > lastSlow ||
			state.playerHp > lastPlayerHp ||
			consumed
		) {
			turret.ringPulse();
		}
		lastFreeze = state.freezeTicksLeft;
		lastSlow = state.slowTicksLeft;
		lastTargetPowerupId = state.targetPowerupId;
		lastPlayerHp = state.playerHp;
	}

	function render() {
		turret.update(state);
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
			if (running) {
				accumulator += now - lastTime;
				let ticks = Math.floor(accumulator / TICK_MS);
				accumulator -= ticks * TICK_MS;
				if (ticks > MAX_CATCHUP_TICKS) ticks = MAX_CATCHUP_TICKS;
				advance(ticks);
			}
			// advance lastTime every frame — including while paused — so resuming
			// never replays the wall-time that elapsed behind the start overlay
			lastTime = now;
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
		setRunning(next: boolean) {
			// on resume, clear time accrued while paused so the sim steps forward
			// one frame at a time rather than catching up on the paused interval
			if (next && !running) {
				lastTime = performance.now();
				accumulator = 0;
			}
			running = next;
		},
		getState: () => state,
		// whole scene ready to draw — async PNG textures decoded AND their material
		// shader variants compiled. Lets tests gate the deterministic frame so it
		// never captures a mesh Babylon skipped while its effect was still building.
		renderReady: () => gameScene.scene.isReady(),
		dispose() {
			gameScene.engine.stopRenderLoop();
			effects.dispose();
			turret.dispose();
			enemies.dispose();
			powerups.dispose();
			gameScene.dispose();
		},
	};
}
