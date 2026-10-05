import { Color3, Vector3 } from "@babylonjs/core/Maths/math";
import { isBoss } from "../content/enemies";
import type { RunRenderer } from "../session/run-session";
import { killScoreWithPerks } from "../sim/perks";
import type { GameState } from "../sim/state";
import { arenaInk } from "../view";
import { createEffects, SHOT_TRAVEL_MS } from "./effects";
import { createEnemyRenderer } from "./enemy-renderer";
import {
	dispatchEffects,
	type EffectCommands,
	killCredit,
} from "./frame-effects";
import { createJuice, type JuiceOutput } from "./juice";
import { loadLabelFont, refreshLabelTheme } from "./label";
import { createPost } from "./post";
import { createPowerupRenderer } from "./powerup-renderer";
import { createQualityWatch } from "./quality";
import { createGameScene } from "./scene";
import { createSpriteAtlas } from "./sprite-atlas";
import { createTurret } from "./turret";
import { visualFor } from "./visuals";

export type BabylonRenderer = RunRenderer & {
	/** Call `frame` once per display frame until disposed. */
	runRenderLoop(frame: () => void): void;
};

/** A theme hex colour as a Color3, or the fallback if it isn't #rrggbb. */
function toColor3(hex: string, fallback: string): Color3 {
	return Color3.FromHexString(/^#[0-9a-f]{6}$/i.test(hex) ? hex : fallback);
}

const TICK_MS = 1000 / 60;

export function createBabylonRenderer(
	canvas: HTMLCanvasElement,
	{
		preserveDrawingBuffer,
		simClock,
	}: {
		preserveDrawingBuffer: boolean;
		/** Time effects by sim ticks, not the wall clock, so a frame drawn on
		 * demand (test mode) is reproducible. */
		simClock: boolean;
	},
): BabylonRenderer {
	const reducedMotion =
		typeof window !== "undefined" &&
		window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
	const gameScene = createGameScene(canvas, { preserveDrawingBuffer });
	// ONE shared pixel-art sprite atlas backs enemies, the hero and powerups
	const atlas = createSpriteAtlas(gameScene.scene);
	const enemies = createEnemyRenderer(
		gameScene.scene,
		gameScene.glow,
		atlas.manager,
		gameScene.view,
		{ reducedMotion },
	);
	const powerups = createPowerupRenderer(
		gameScene.scene,
		gameScene.glow,
		atlas.manager,
		gameScene.view,
	);
	// plates, the turret and effects draw in the live theme
	const css = getComputedStyle(document.documentElement);
	const readVar = (name: string) => css.getPropertyValue(name).trim();
	const ink = arenaInk(readVar("--bg"), readVar("--text"));
	const primary = toColor3(readVar("--primary"), "#e2b714");
	const error = toColor3(readVar("--error"), "#ca4754");
	const effects = createEffects(
		gameScene.scene,
		gameScene.glow,
		gameScene.view,
		{
			primary,
			error,
			primaryCss: readVar("--primary") || "#e2b714",
			inkCss: ink.ink,
			plateCss: ink.plate,
		},
		{ reducedMotion, ambient: !simClock },
	);
	const turret = createTurret(gameScene.scene, atlas.manager, {
		primary,
		error,
		plate: toColor3(ink.plate, "#101218"),
	});
	const post = createPost(gameScene.scene, gameScene.camera, {
		reducedMotion,
	});
	const juice = createJuice({ reducedMotion });
	refreshLabelTheme(readVar, arenaInk);
	loadLabelFont();
	// scratch vectors reused every frame — the hot path allocates nothing
	const muzzle = new Vector3();
	const shotTo = new Vector3();
	// slow GPUs step quality down, one way, in real time only
	const quality = createQualityWatch();
	let wasOver = false;

	// per-draw context the effect commands read
	let now = 0;
	let combo = 0;
	let scoreGain = 0;
	let feel: JuiceOutput = juice.update(0, 0);

	const fx: EffectCommands = {
		shot(x, y, kind, id) {
			// snap the hero's heading to the target, then draw from the fresh muzzle
			turret.fire(x, y, now);
			turret.getMuzzle(muzzle);
			shotTo.set(x, 1, y);
			effects.shot(muzzle, shotTo, kind, now, feel.overdrive);
			enemies.hit(id, kind !== "light", now);
			juice.keystroke(now);
		},
		spark: (x, y) => effects.spark(x, y, now),
		kill(x, y, id, archetypeId, nth, of) {
			const { color } = visualFor(archetypeId);
			const boss = isBoss({ archetypeId });
			// each kill is scored by its own word when the plate showed it
			const len = enemies.wordLength(id);
			const state = current;
			const scoreFor =
				len !== undefined && state
					? (streak: number) => killScoreWithPerks(state, len, streak)
					: undefined;
			effects.kill(
				x,
				y,
				color,
				boss,
				now,
				killCredit(of, scoreGain, combo, nth, scoreFor),
			);
			gameScene.ground.stampCorpse(x, y, color, id);
			// the death lands when the shot does
			enemies.killed(id, now + SHOT_TRAVEL_MS);
			juice.kill(now + SHOT_TRAVEL_MS, combo, boss);
		},
		breach(x, y, id) {
			gameScene.ground.stampScar(x, y, id);
			effects.breach(x, y, now);
			enemies.killed(id, now);
		},
		coreHit: () => juice.breach(now),
		powerupPulse: () => turret.ringPulse("powerup", now),
	};

	let lastScore = 0;
	let lastNow = Number.NaN;
	// the state this frame's kills are scored against
	let current: GameState | null = null;

	return {
		draw(state, events) {
			now = simClock ? state.tick * TICK_MS : performance.now();
			const dt = Number.isNaN(lastNow) ? 0 : Math.max(0, now - lastNow);
			lastNow = now;
			if (!simClock) {
				const step = quality.sample(dt, now);
				if (step === "shed-post") post.shed();
				if (step === "lower-resolution") {
					const engine = gameScene.engine;
					engine.setHardwareScalingLevel(
						Math.min(1, engine.getHardwareScalingLevel() * 1.5),
					);
				}
			}
			current = state;
			combo = state.combo;
			scoreGain = state.score - lastScore;
			lastScore = state.score;
			for (const ev of events) {
				if (ev.type !== "absorb") continue;
				const e = state.enemies.find((en) => en.id === ev.id);
				enemies.absorbed(ev.id, e?.ability?.kind === "armored-front", now);
			}
			turret.update(state, now);
			dispatchEffects(events, fx);
			// the core falls: a last flash and shockwave while the light dies
			const over = state.status === "gameover";
			if (over && !wasOver) {
				effects.collapse(now);
				juice.collapse(now);
			}
			wasOver = over;
			// one GPU upload for every corpse/scar stamped this frame
			gameScene.ground.flush();

			feel = juice.update(now, state.combo);
			// a wide ring is motion; reduced motion keeps the panel flash only
			if (feel.tierUp && !reducedMotion) turret.ringPulse("tier", now);
			effects.setLight(feel.light, feel.lightGain);
			effects.update(now);
			gameScene.setCameraFeel(feel.zoom, feel.shakeX, feel.shakeY);
			post.update(feel);

			enemies.sync(state, now);
			powerups.sync(state);
			gameScene.scene.render();
		},
		runRenderLoop: (frame) => gameScene.engine.runRenderLoop(frame),
		// whole scene ready to draw — async PNG textures decoded AND their material
		// shader variants compiled. Lets tests gate the deterministic frame so it
		// never captures a mesh Babylon skipped while its effect was still building.
		isReady: () => gameScene.scene.isReady(),
		dispose() {
			gameScene.engine.stopRenderLoop();
			post.dispose();
			effects.dispose();
			turret.dispose();
			enemies.dispose();
			powerups.dispose();
			atlas.dispose();
			gameScene.dispose();
		},
	};
}
