import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color4, Vector3 } from "@babylonjs/core/Maths/math";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { Scene } from "@babylonjs/core/scene";
// GLSL particle shaders (WebGL engine) — required so the pooled ParticleSystem
// has its render program registered without pulling the whole Babylon bundle.
import "@babylonjs/core/Shaders/particles.fragment";
import "@babylonjs/core/Shaders/particles.vertex";
import type { GameState } from "../sim/state";

const BASE_CLEAR: readonly [number, number, number] = [0.04, 0.04, 0.07];
const FREEZE_TINT: readonly [number, number, number] = [0.05, 0.13, 0.24];
const SLOW_TINT: readonly [number, number, number] = [0.17, 0.11, 0.02];
const SHAKE_FRAMES = 20;
const SHAKE_MAG = 0.6;
const BURST_COUNT = 36;

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

/** Deterministic jitter in [-1, 1] from an integer step — render layer only, so
 * Math.sin is fair game and keeps the shaken frame reproducible across runs. */
function jitter(k: number): number {
	const s = Math.sin(k * 12.9898) * 43758.5453;
	return (s - Math.floor(s)) * 2 - 1;
}

export type Effects = {
	deathBurst(
		pos: { x: number; y: number },
		color: [number, number, number],
	): void;
	playerHit(): void;
	update(state: GameState): void;
	dispose(): void;
};

export function createEffects(scene: Scene): Effects {
	// radial white dot sprite drawn once (Task 5 swaps in /game/particle.png)
	const sprite = new DynamicTexture(
		"fx-particle",
		{ width: 64, height: 64 },
		scene,
		false,
	);
	// biome-ignore lint/suspicious/noExplicitAny: ICanvasRenderingContext lacks gradient typing
	const sctx = sprite.getContext() as any;
	const grad = sctx.createRadialGradient(32, 32, 0, 32, 32, 32);
	grad.addColorStop(0, "rgba(255,255,255,1)");
	grad.addColorStop(0.4, "rgba(255,255,255,0.8)");
	grad.addColorStop(1, "rgba(255,255,255,0)");
	sctx.fillStyle = grad;
	sctx.fillRect(0, 0, 64, 64);
	sprite.hasAlpha = true;
	sprite.update();

	const emitter = new Vector3(0, 0.5, 0);
	const ps = new ParticleSystem("fx-deaths", 200, scene);
	ps.particleTexture = sprite;
	ps.emitter = emitter;
	ps.minSize = 0.25;
	ps.maxSize = 0.7;
	ps.minLifeTime = 0.25;
	ps.maxLifeTime = 0.6;
	ps.emitRate = 0;
	ps.blendMode = ParticleSystem.BLENDMODE_ONEONE;
	ps.gravity = new Vector3(0, -6, 0);
	ps.direction1 = new Vector3(-3, 3, -3);
	ps.direction2 = new Vector3(3, 6, 3);
	ps.minEmitPower = 1.5;
	ps.maxEmitPower = 4;
	ps.updateSpeed = 1 / 60;
	ps.preventAutoStart = true;
	ps.manualEmitCount = 0;
	ps.start();

	const camTarget = new Vector3(0, 0, 0);
	let shake = 0;
	let shakeStep = 0;

	return {
		deathBurst(pos, color) {
			emitter.set(pos.x, 0.5, pos.y);
			ps.color1 = new Color4(color[0], color[1], color[2], 1);
			ps.color2 = new Color4(color[0] * 0.5, color[1] * 0.5, color[2] * 0.5, 1);
			ps.colorDead = new Color4(
				color[0] * 0.2,
				color[1] * 0.2,
				color[2] * 0.2,
				0,
			);
			ps.manualEmitCount += BURST_COUNT;
		},
		playerHit() {
			shake = SHAKE_FRAMES;
		},
		update(state) {
			// status color grade: freeze wins over slow, both lerp toward a tint
			let tint = BASE_CLEAR;
			let t = 0;
			if (state.freezeTicksLeft > 0) {
				tint = FREEZE_TINT;
				t = 0.65;
			} else if (state.slowTicksLeft > 0) {
				tint = SLOW_TINT;
				t = 0.5;
			}
			scene.clearColor.r = lerp(BASE_CLEAR[0], tint[0], t);
			scene.clearColor.g = lerp(BASE_CLEAR[1], tint[1], t);
			scene.clearColor.b = lerp(BASE_CLEAR[2], tint[2], t);

			// screen shake: decaying deterministic camera-target jitter
			const cam = scene.activeCamera as ArcRotateCamera | null;
			if (cam) {
				if (shake > 0) {
					const m = (shake / SHAKE_FRAMES) * SHAKE_MAG;
					camTarget.set(jitter(shakeStep) * m, 0, jitter(shakeStep + 7) * m);
					cam.setTarget(camTarget);
					shakeStep += 1;
					shake -= 1;
					if (shake === 0) {
						camTarget.set(0, 0, 0);
						cam.setTarget(camTarget);
					}
				}
			}
		},
		dispose() {
			ps.dispose();
			sprite.dispose();
		},
	};
}
