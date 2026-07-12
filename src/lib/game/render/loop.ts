import { Vector3 } from "@babylonjs/core/Maths/math";
import type { GameState } from "../sim/state";
import { ARENA, createInitialState } from "../sim/state";
import { type GameEvent, step } from "../sim/step";
import { createEffects } from "./effects";
import { createEnemyRenderer } from "./enemy-renderer";
import { createPowerupRenderer } from "./powerup-renderer";
import { createGameScene } from "./scene";
import { createSpriteAtlas } from "./sprite-atlas";
import { createTurret } from "./turret";
import { visualFor } from "./visuals";

const TICK_MS = 1000 / 60;
const MAX_CATCHUP_TICKS = 30; // degraded-tab guard: drop time instead of spiraling
// a vanished enemy whose last-seen position was this close to the origin, in a
// frame where the core also lost hp, breached the core — it was not typed to
// death, so it gets the hit shake but no kill burst. Derived from the sim's
// killRadius plus a small margin to absorb the sub-tick of travel before the
// enemy was pruned, so it tracks the kill ring automatically.
const BREACH_RADIUS = ARENA.killRadius + 0.8;

export type GameLoopOptions = {
	canvas: HTMLCanvasElement;
	seed: number;
	testMode: boolean;
	onState(state: GameState): void;
};

export type GameLoop = {
	pushKey(key: string): void;
	/** Release the active target (Backspace) — keeps all typed progress. */
	pushBackspace(): void;
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
	// ONE shared pixel-art sprite atlas backs enemies, the hero and powerups
	const atlas = createSpriteAtlas(gameScene.scene);
	const enemies = createEnemyRenderer(
		gameScene.scene,
		gameScene.glow,
		atlas.manager,
	);
	const powerups = createPowerupRenderer(
		gameScene.scene,
		gameScene.glow,
		atlas.manager,
	);
	const effects = createEffects(gameScene.scene);
	const turret = createTurret(gameScene.scene, atlas.manager);
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
	// powerup-activation watch: the sim counts every applied powerup, so a rise in
	// powerupsUsed is the single unambiguous "player triggered a powerup" signal →
	// ring pulse. An expiring (never-completed) pickup no longer fakes it.
	let lastPowerupsUsed = state.powerupsUsed;
	// absorb-clang watch: the sim counts every completion that clanged off plating
	// (shield / armored-front), so a rise in absorbs is the single unambiguous
	// "a hit rang off" signal → dull-spark clang. Counter-driven so a same-frame
	// typedCount reset (retype right after the clang) can never lose the feedback.
	let lastAbsorbs = state.absorbs;

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
				// a keystroke landed on this enemy this frame → visible shot; an hp
				// drop means a damaging completion → heavier bolt + muzzle flash. The
				// shield / armored-front CLANG is NOT inferred here — it rides the sim's
				// monotonic absorbs counter below, which no same-frame typedCount reset
				// can hide.
				const typed = e.typedCount > info.typedCount;
				const damaged = e.hp < info.hp;
				if (damaged || typed) {
					// snap the hero's heading to this target (last-shot heading) and
					// read the fresh muzzle along it before drawing the bolt
					turret.fire(e.pos.x, e.pos.y);
					turret.getMuzzle(muzzle);
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
		// With N breaches this frame, attribute them to the N vanished-near-core
		// enemies NEAREST the origin (sorted, consumed in order) so the choice is
		// deterministic and never depends on Map iteration order; every other
		// vanished enemy is a typed-to-death kill.
		const breaches = lastPlayerHp - state.playerHp;
		const vanished: [number, Seen][] = [];
		for (const entry of lastSeen) {
			if (!entry[1].seen) vanished.push(entry);
		}
		const breachIds = new Set<number>(
			vanished
				.filter(([, info]) => Math.hypot(info.x, info.y) <= BREACH_RADIUS)
				.sort((a, b) => Math.hypot(a[1].x, a[1].y) - Math.hypot(b[1].x, b[1].y))
				.slice(0, Math.max(0, breaches))
				.map(([id]) => id),
		);
		for (const [id, info] of vanished) {
			if (breachIds.has(id)) {
				// core hit, not a kill: no burst — scar the ground where the horde
				// broke through the core
				gameScene.ground.stampScar(info.x, info.y, id);
			} else {
				// a typed-to-death enemy: final bolt + muzzle flash, then burst
				turret.fire(info.x, info.y);
				turret.getMuzzle(muzzle);
				shotTo.set(info.x, 1, info.y);
				effects.fireTracer(muzzle, shotTo, true);
				effects.muzzleFlash(muzzle, true);
				effects.deathBurst(info, info.color);
				// bake a persistent corpse decal into the ground at the death spot
				gameScene.ground.stampCorpse(info.x, info.y, info.color, id);
			}
			lastSeen.delete(id);
		}
		// one GPU upload for every corpse/scar stamped this frame
		gameScene.ground.flush();
		if (state.playerHp < lastPlayerHp) effects.playerHit();

		// absorb clang: fired on the rise of the sim's monotonic absorbs counter, so
		// it can never be lost to a same-frame typedCount reset. A clang is a bolt +
		// DULL spark rung off the locked target (the enemy the completion clanged
		// against) — no hp drop, distinct from the kill burst.
		if (state.absorbs > lastAbsorbs) {
			const target = state.enemies.find((e) => e.id === state.targetId);
			if (target) {
				turret.fire(target.pos.x, target.pos.y);
				turret.getMuzzle(muzzle);
				shotTo.set(target.pos.x, 1, target.pos.y);
				effects.fireTracer(muzzle, shotTo, true);
				effects.muzzleFlash(muzzle, false); // dull spark
			}
		}
		lastAbsorbs = state.absorbs;

		// powerup activation → radial ring pulse from the turret, fired only on the
		// rise of the sim's applied-powerup counter
		if (state.powerupsUsed > lastPowerupsUsed) {
			turret.ringPulse();
		}
		lastPowerupsUsed = state.powerupsUsed;
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
		pushBackspace() {
			pending.push({ type: "backspace" });
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
			atlas.dispose();
			gameScene.dispose();
		},
	};
}
