import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, type Vector3 } from "@babylonjs/core/Maths/math";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { GameState } from "../sim/state";

const MUZZLE_Y = 1.1; // height the barrel fires from
const MUZZLE_LEN = 3.1; // distance from core to barrel tip
const RING_LIFE = 22; // frames a powerup ring pulse lives

export type Turret = {
	/** Rotate to face the locked target (lerped) or idle-spin; pulse the core. */
	update(state: GameState): void;
	/** World position of the barrel tip along its CURRENT facing, into `out`. */
	getMuzzle(out: Vector3): Vector3;
	/** Kick off a radial ring pulse from the player (powerup activation). */
	ringPulse(): void;
	dispose(): void;
};

function mat(scene: Scene, name: string, diffuse: Color3, emissive: Color3) {
	const m = new StandardMaterial(name, scene);
	m.diffuseColor = diffuse;
	m.emissiveColor = emissive;
	m.specularColor = new Color3(0.2, 0.2, 0.25);
	return m;
}

function lerpAngle(a: number, b: number, t: number): number {
	let diff = b - a;
	while (diff > Math.PI) diff -= Math.PI * 2;
	while (diff < -Math.PI) diff += Math.PI * 2;
	return a + diff * t;
}

/**
 * The player: a layered defensive turret at the arena core. A sunk base ring,
 * a pulsing energy core, and a rotating barrel assembly that tracks the locked
 * target (or idles with a slow sweep). Everything is built once and animated
 * render-side from the sim tick — no per-frame allocation.
 */
export function createTurret(scene: Scene): Turret {
	const root = new TransformNode("turret", scene);

	// sunk base plate
	const base = CreateCylinder(
		"turret-base",
		{ height: 0.5, diameterTop: 3.4, diameterBottom: 4, tessellation: 32 },
		scene,
	);
	base.position.y = 0.25;
	base.material = mat(
		scene,
		"turret-base-mat",
		new Color3(0.14, 0.16, 0.22),
		new Color3(0.02, 0.03, 0.05),
	);
	base.parent = root;

	// pulsing energy core
	const core = CreateSphere(
		"turret-core",
		{ diameter: 1.5, segments: 16 },
		scene,
	);
	core.position.y = 1.0;
	const coreMat = mat(
		scene,
		"turret-core-mat",
		new Color3(0.3, 0.8, 1),
		new Color3(0.15, 0.55, 0.9),
	);
	core.material = coreMat;
	core.parent = root;

	// rotating barrel assembly
	const barrel = new TransformNode("turret-barrel", scene);
	barrel.position.y = MUZZLE_Y;
	barrel.parent = root;

	const barrelMat = mat(
		scene,
		"turret-barrel-mat",
		new Color3(0.55, 0.62, 0.72),
		new Color3(0.05, 0.08, 0.12),
	);
	const shaft = CreateBox(
		"turret-shaft",
		{ width: 0.5, height: 0.5, depth: 2.6 },
		scene,
	);
	shaft.position.z = 1.3;
	shaft.material = barrelMat;
	shaft.parent = barrel;

	const tip = CreateBox(
		"turret-tip",
		{ width: 0.7, height: 0.7, depth: 0.6 },
		scene,
	);
	tip.position.z = 2.7;
	tip.material = mat(
		scene,
		"turret-tip-mat",
		new Color3(0.6, 0.9, 1),
		new Color3(0.4, 0.8, 1),
	);
	tip.parent = barrel;

	// twin side fins for a heavier silhouette
	for (const sx of [-1, 1]) {
		const fin = CreateBox(
			"turret-fin",
			{ width: 0.25, height: 0.35, depth: 1.4 },
			scene,
		);
		fin.position.set(sx * 0.55, 0, 1.0);
		fin.material = barrelMat;
		fin.parent = barrel;
	}

	// pooled powerup ring pulse (single, retriggerable)
	const ring = CreateTorus(
		"turret-ring",
		{ diameter: 2, thickness: 0.18, tessellation: 40 },
		scene,
	);
	ring.rotation.x = Math.PI / 2;
	ring.position.y = 0.3;
	const ringMat = mat(
		scene,
		"turret-ring-mat",
		new Color3(0.5, 0.9, 1),
		new Color3(0.4, 0.85, 1),
	);
	ringMat.alpha = 0;
	ring.material = ringMat;
	ring.setEnabled(false);
	let ringLife = 0;

	// core danger ring: the defensive perimeter the player protects. killRadius
	// (1.6) sits inside the turret body, so the visible warning line is drawn at a
	// readable perimeter and flares red when the horde presses close.
	const danger = CreateTorus(
		"turret-danger",
		{ diameter: 9, thickness: 0.14, tessellation: 64 },
		scene,
	);
	danger.rotation.x = Math.PI / 2;
	danger.position.y = 0.12;
	const dangerMat = mat(
		scene,
		"turret-danger-mat",
		new Color3(0.5, 0.4, 0.15),
		new Color3(0.5, 0.4, 0.15),
	);
	danger.material = dangerMat;

	let yaw = 0;

	return {
		update(state: GameState) {
			const target = state.enemies.find((e) => e.id === state.targetId);
			if (target) {
				const desired = Math.atan2(target.pos.x, target.pos.y);
				yaw = lerpAngle(yaw, desired, 0.25);
			} else {
				yaw += 0.012; // idle sweep
			}
			barrel.rotation.y = yaw;

			// core pulse — brighter/larger while a target is locked
			const pulse = 0.5 + 0.5 * Math.sin(state.tick * 0.12);
			const gain = target ? 1.4 : 1;
			coreMat.emissiveColor.set(
				0.15 * (1 + pulse) * gain,
				0.55 * (0.7 + pulse * 0.5) * gain,
				0.9 * (0.7 + pulse * 0.5) * gain,
			);
			core.scaling.setAll(1 + pulse * 0.08);

			if (ringLife > 0) {
				ringLife -= 1;
				const t = 1 - ringLife / RING_LIFE;
				ring.scaling.setAll(1 + t * 5);
				ringMat.alpha = (1 - t) * 0.7;
				if (ringLife === 0) ring.setEnabled(false);
			}

			// core danger ring: nearest enemy proximity drives colour + pulse — calm
			// amber when clear, flaring red and pulsing hard when the horde is close
			let nearest = Infinity;
			for (const e of state.enemies) {
				const d = Math.hypot(e.pos.x, e.pos.y);
				if (d < nearest) nearest = d;
			}
			const threat = nearest < 6 ? 1 - nearest / 6 : 0;
			const beat = 0.5 + 0.5 * Math.sin(state.tick * (0.1 + threat * 0.25));
			const glow = 0.35 + beat * (0.25 + threat * 0.7);
			dangerMat.emissiveColor.set(
				(0.5 + threat * 0.5) * glow * 2,
				(0.4 - threat * 0.35) * glow * 2,
				(0.15 - threat * 0.12) * glow * 2,
			);
		},
		getMuzzle(out: Vector3): Vector3 {
			out.set(Math.sin(yaw) * MUZZLE_LEN, MUZZLE_Y, Math.cos(yaw) * MUZZLE_LEN);
			return out;
		},
		ringPulse() {
			ringLife = RING_LIFE;
			ring.setEnabled(true);
			ring.scaling.setAll(1);
			ringMat.alpha = 0.7;
		},
		dispose() {
			root.dispose(false, true);
			(ring as Mesh).dispose(false, true);
			(danger as Mesh).dispose(false, true);
		},
	};
}
