import { Vector3 } from "@babylonjs/core/Maths/math";
import type { SimEvent } from "../sim/events";
import type { GameState } from "../sim/state";
import { createInitialState } from "../sim/state";
import { type GameEvent, step } from "../sim/step";
import { createEffects } from "./effects";
import { createEnemyRenderer } from "./enemy-renderer";
import { dispatchEffects, type EffectCommands } from "./frame-effects";
import { createPowerupRenderer } from "./powerup-renderer";
import { createGameScene } from "./scene";
import { createSpriteAtlas } from "./sprite-atlas";
import { createTurret } from "./turret";
import { visualFor } from "./visuals";

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
	/** Release the active target (Backspace) — keeps all typed progress. */
	pushBackspace(): void;
	/** Pick perk card `index` (0|1|2) during the perk-choice overlay. */
	pushPerk(index: number): void;
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

	// sim events from every tick since the last render, drained once per frame
	const frameEvents: SimEvent[] = [];
	const burstAt = { x: 0, y: 0 };
	const fx: EffectCommands = {
		shot(x, y, kind) {
			// snap the hero's heading to the target, then draw from the fresh muzzle
			turret.fire(x, y);
			turret.getMuzzle(muzzle);
			shotTo.set(x, 1, y);
			effects.fireTracer(muzzle, shotTo, kind !== "light");
			if (kind !== "light") effects.muzzleFlash(muzzle, kind === "heavy");
		},
		spark: (x, y) => effects.spark(x, y),
		kill(x, y, id, archetypeId) {
			const { color } = visualFor(archetypeId);
			burstAt.x = x;
			burstAt.y = y;
			effects.deathBurst(burstAt, color);
			gameScene.ground.stampCorpse(x, y, color, id);
		},
		breach(x, y, id) {
			gameScene.ground.stampScar(x, y, id);
		},
		coreHit: () => effects.playerHit(),
		powerupPulse: () => turret.ringPulse(),
	};

	function advance(ticks: number) {
		for (let i = 0; i < ticks; i++) {
			state = step(state, pending, frameEvents);
			pending = [];
		}
	}

	function drainEvents() {
		dispatchEffects(frameEvents, fx);
		frameEvents.length = 0;
		// one GPU upload for every corpse/scar stamped this frame
		gameScene.ground.flush();
	}

	function render() {
		turret.update(state);
		drainEvents();
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
		pushPerk(index: number) {
			pending.push({ type: "perk", index });
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
