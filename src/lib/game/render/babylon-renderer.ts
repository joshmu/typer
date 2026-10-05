import { Color3, Vector3 } from "@babylonjs/core/Maths/math";
import { isBoss } from "../content/enemies";
import type { RunRenderer } from "../session/run-session";
import { arenaInk } from "../view";
import { createEffects } from "./effects";
import { createEnemyRenderer } from "./enemy-renderer";
import {
	dispatchEffects,
	type EffectCommands,
	killCredit,
} from "./frame-effects";
import { createJuice, type JuiceOutput } from "./juice";
import { loadLabelFont, refreshLabelTheme } from "./label";
import { createPost, type StatusTint } from "./post";
import { createPowerupRenderer } from "./powerup-renderer";
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

// the freeze/slow grade washes in and out over about this long
const TINT_MS = 200;
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
	const tint: StatusTint = { freeze: 0, slow: 0 };

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
			effects.kill(
				x,
				y,
				color,
				boss,
				now,
				killCredit(of, scoreGain, combo, nth),
			);
			gameScene.ground.stampCorpse(x, y, color, id);
			enemies.killed(id, now);
			juice.kill(now, combo, boss);
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
	function ease(v: number, on: boolean, dt: number): number {
		return (on ? 1 : 0) + (v - (on ? 1 : 0)) * Math.exp(-dt / (TINT_MS / 3));
	}

	return {
		draw(state, events) {
			now = simClock ? state.tick * TICK_MS : performance.now();
			const dt = Number.isNaN(lastNow) ? 0 : Math.max(0, now - lastNow);
			lastNow = now;
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
			// one GPU upload for every corpse/scar stamped this frame
			gameScene.ground.flush();

			feel = juice.update(now, state.combo);
			if (feel.tierUp) turret.ringPulse("tier", now);
			effects.setLight(feel.light, feel.lightGain);
			effects.update(now);
			gameScene.setCameraFeel(feel.zoom, feel.shakeX, feel.shakeY);
			tint.freeze = ease(tint.freeze, state.freezeTicksLeft > 0, dt);
			tint.slow = ease(
				tint.slow,
				state.freezeTicksLeft <= 0 && state.slowTicksLeft > 0,
				dt,
			);
			post.update(feel, tint);

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
