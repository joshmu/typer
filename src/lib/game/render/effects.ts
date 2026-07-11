import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3, Color4, Vector3 } from "@babylonjs/core/Maths/math";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
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
const TRACER_POOL = 16;
const FLASH_POOL = 4;
const TRACER_LIFE = 4; // frames a keystroke tracer is visible
const TRACER_LIFE_HEAVY = 7; // a completion bolt lingers a touch longer
const FLASH_LIFE = 3;

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
	/** A shot from the muzzle to a world point; `heavy` for word completions. */
	fireTracer(from: Vector3, to: Vector3, heavy: boolean): void;
	/** A brief muzzle burst at a world point (word completion / kill). */
	muzzleFlash(at: Vector3, heavy: boolean): void;
	update(state: GameState): void;
	dispose(): void;
};

export function createEffects(scene: Scene): Effects {
	// seeded radial spark sprite (scripts/gen-assets.ts)
	const sprite = new Texture("/game/particle.png", scene);
	sprite.hasAlpha = true;

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

	// pooled projectile tracers — thin emissive boxes stretched along the shot,
	// each with a life counter faded out in update(). No per-shot allocation.
	const tracerMat = new StandardMaterial("fx-tracer-mat", scene);
	tracerMat.emissiveColor = new Color3(0.7, 0.95, 1);
	tracerMat.diffuseColor = new Color3(0, 0, 0);
	tracerMat.disableLighting = true;
	tracerMat.alpha = 1;
	const heavyMat = new StandardMaterial("fx-tracer-heavy-mat", scene);
	heavyMat.emissiveColor = new Color3(1, 0.95, 0.75);
	heavyMat.diffuseColor = new Color3(0, 0, 0);
	heavyMat.disableLighting = true;

	type Pooled = { mesh: Mesh; life: number; maxLife: number };
	const tracers: Pooled[] = [];
	for (let i = 0; i < TRACER_POOL; i++) {
		const mesh = CreateBox(`fx-tracer-${i}`, { size: 1 }, scene);
		mesh.material = tracerMat;
		mesh.isPickable = false;
		mesh.setEnabled(false);
		tracers.push({ mesh, life: 0, maxLife: TRACER_LIFE });
	}
	const flashes: Pooled[] = [];
	for (let i = 0; i < FLASH_POOL; i++) {
		const mesh = CreateSphere(
			`fx-flash-${i}`,
			{ diameter: 1, segments: 8 },
			scene,
		);
		mesh.material = heavyMat;
		mesh.isPickable = false;
		mesh.setEnabled(false);
		flashes.push({ mesh, life: 0, maxLife: FLASH_LIFE });
	}

	function acquire(pool: Pooled[]): Pooled {
		let pick = pool[0];
		for (const p of pool) {
			if (p.life <= 0) return p;
			if (p.life < pick.life) pick = p; // else steal the one closest to done
		}
		return pick;
	}

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
		fireTracer(from, to, heavy) {
			const t = acquire(tracers);
			const dx = to.x - from.x;
			const dz = to.z - from.z;
			const len = Math.hypot(dx, dz) || 0.001;
			t.mesh.position.set((from.x + to.x) / 2, from.y, (from.z + to.z) / 2);
			t.mesh.rotation.y = Math.atan2(dx, dz);
			const w = heavy ? 0.22 : 0.09;
			t.mesh.scaling.set(w, w, len);
			t.mesh.material = heavy ? heavyMat : tracerMat;
			t.maxLife = heavy ? TRACER_LIFE_HEAVY : TRACER_LIFE;
			t.life = t.maxLife;
			t.mesh.visibility = 1;
			t.mesh.setEnabled(true);
		},
		muzzleFlash(at, heavy) {
			const f = acquire(flashes);
			f.mesh.position.copyFrom(at);
			f.mesh.scaling.setAll(heavy ? 1.5 : 1);
			f.life = FLASH_LIFE;
			f.mesh.visibility = 1;
			f.mesh.setEnabled(true);
		},
		update(state) {
			// fade + retire pooled tracers and flashes
			for (const t of tracers) {
				if (t.life <= 0) continue;
				t.life -= 1;
				if (t.life <= 0) {
					t.mesh.setEnabled(false);
				} else {
					t.mesh.visibility = t.life / t.maxLife;
				}
			}
			for (const f of flashes) {
				if (f.life <= 0) continue;
				f.life -= 1;
				const k = f.life / FLASH_LIFE;
				f.mesh.scaling.setAll((f.mesh.scaling.x || 1) * 0.8 + 0.001);
				f.mesh.visibility = k;
				if (f.life <= 0) f.mesh.setEnabled(false);
			}

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
			for (const t of tracers) t.mesh.dispose(false, true);
			for (const f of flashes) f.mesh.dispose(false, true);
			tracerMat.dispose();
			heavyMat.dispose();
		},
	};
}
