import { Color3, Vector3 } from "@babylonjs/core/Maths/math";
import type { RunRenderer } from "../session/run-session";
import { arenaInk } from "../view";
import { createEffects } from "./effects";
import { createEnemyRenderer } from "./enemy-renderer";
import { dispatchEffects, type EffectCommands } from "./frame-effects";
import { loadLabelFont, refreshLabelTheme } from "./label";
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

export function createBabylonRenderer(
	canvas: HTMLCanvasElement,
	{ preserveDrawingBuffer }: { preserveDrawingBuffer: boolean },
): BabylonRenderer {
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
	const effects = createEffects(gameScene.scene);
	// plates and the turret draw in the live theme
	const css = getComputedStyle(document.documentElement);
	const readVar = (name: string) => css.getPropertyValue(name).trim();
	const ink = arenaInk(readVar("--bg"), readVar("--text"));
	const turret = createTurret(gameScene.scene, atlas.manager, {
		primary: toColor3(readVar("--primary"), "#e2b714"),
		error: toColor3(readVar("--error"), "#ca4754"),
		plate: toColor3(ink.plate, "#101218"),
	});
	refreshLabelTheme(readVar, arenaInk);
	loadLabelFont();
	// scratch vectors reused every frame — the hot path allocates nothing
	const muzzle = new Vector3();
	const shotTo = new Vector3();

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

	return {
		draw(state, events) {
			const now = performance.now();
			for (const ev of events) {
				if (ev.type !== "absorb") continue;
				const e = state.enemies.find((en) => en.id === ev.id);
				enemies.absorbed(ev.id, e?.ability?.kind === "armored-front", now);
			}
			turret.update(state);
			dispatchEffects(events, fx);
			// one GPU upload for every corpse/scar stamped this frame
			gameScene.ground.flush();
			effects.update(state);
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
			effects.dispose();
			turret.dispose();
			enemies.dispose();
			powerups.dispose();
			atlas.dispose();
			gameScene.dispose();
		},
	};
}
