import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, type Vector3 } from "@babylonjs/core/Maths/math";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { isCloaked } from "../sim/abilities";
import type { EnemyState, GameState } from "../sim/state";

const MUZZLE_Y = 1.1; // height the barrels fire from
const MUZZLE_LEN = 3.1; // distance from core to barrel tip
const RING_LIFE = 22; // frames a powerup ring pulse lives
const AIM_SLERP = 0.2; // heading smoothing toward the aim target
const RECOIL_DECAY = 0.82; // per-frame recoil spring relaxation

export type Turret = {
	/** Aim the barrels at the active/nearest target (holding heading when the
	 * field is clear); animate core, radar and recoil from the sim tick. */
	update(state: GameState): void;
	/** World position of the barrel tip along the CURRENT facing, into `out`. */
	getMuzzle(out: Vector3): Vector3;
	/** Kick the barrel recoil spring on a shot (heavier for a completion). */
	recoil(heavy: boolean): void;
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
 * The player: a layered defensive turret at the arena core. A hexagonal sunk
 * base with cooling fins, a combo-scaled energy core, a slow independent radar
 * sweep, and a twin-barrel assembly that AIMS (atan2 + slerp) at the active
 * target — or, with none locked, the nearest enemy anticipatorily — and simply
 * HOLDS its last heading when the field is clear (no idle spin). Everything is
 * built once and animated render-side from the sim tick; no per-frame allocation.
 */
export function createTurret(scene: Scene): Turret {
	const root = new TransformNode("turret", scene);

	const baseMat = mat(
		scene,
		"turret-base-mat",
		new Color3(0.14, 0.16, 0.22),
		new Color3(0.02, 0.03, 0.05),
	);
	// hexagonal sunk base plate + a narrower upper hex tier for a machined look
	const base = CreateCylinder(
		"turret-base",
		{ height: 0.5, diameterTop: 3.4, diameterBottom: 4, tessellation: 6 },
		scene,
	);
	base.position.y = 0.25;
	base.material = baseMat;
	base.parent = root;
	const baseTop = CreateCylinder(
		"turret-base-top",
		{ height: 0.3, diameterTop: 2.2, diameterBottom: 3.0, tessellation: 6 },
		scene,
	);
	baseTop.position.y = 0.62;
	baseTop.material = baseMat;
	baseTop.parent = root;

	// six cooling fins radiating from the base hex edges
	const finMat = mat(
		scene,
		"turret-fin-mat",
		new Color3(0.3, 0.34, 0.42),
		new Color3(0.04, 0.06, 0.09),
	);
	for (let i = 0; i < 6; i++) {
		const a = (i / 6) * Math.PI * 2;
		const fin = CreateBox(
			"turret-cooling-fin",
			{ width: 0.22, height: 0.5, depth: 1.0 },
			scene,
		);
		fin.position.set(Math.sin(a) * 1.9, 0.35, Math.cos(a) * 1.9);
		fin.rotation.y = a;
		fin.material = finMat;
		fin.parent = root;
	}

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

	// aiming assembly: rotates in yaw to face the target
	const barrel = new TransformNode("turret-barrel", scene);
	barrel.position.y = MUZZLE_Y;
	barrel.parent = root;

	const barrelMat = mat(
		scene,
		"turret-barrel-mat",
		new Color3(0.55, 0.62, 0.72),
		new Color3(0.05, 0.08, 0.12),
	);
	const tipMat = mat(
		scene,
		"turret-tip-mat",
		new Color3(0.6, 0.9, 1),
		new Color3(0.4, 0.8, 1),
	);
	// twin barrels: each is its own node so it can recoil independently in z
	const barrelNodes: TransformNode[] = [];
	for (const sx of [-1, 1]) {
		const bn = new TransformNode(`turret-barrel-${sx}`, scene);
		bn.position.set(sx * 0.42, 0, 0);
		bn.parent = barrel;
		const shaft = CreateBox(
			"turret-shaft",
			{ width: 0.42, height: 0.42, depth: 2.6 },
			scene,
		);
		shaft.position.z = 1.3;
		shaft.material = barrelMat;
		shaft.parent = bn;
		const tip = CreateBox(
			"turret-tip",
			{ width: 0.58, height: 0.58, depth: 0.6 },
			scene,
		);
		tip.position.z = 2.7;
		tip.material = tipMat;
		tip.parent = bn;
		barrelNodes.push(bn);
	}

	// slow, independent radar sweep — a thin lit spoke rotating at its own rate,
	// reading as an always-scanning sensor regardless of where the barrels aim
	const radar = new TransformNode("turret-radar", scene);
	radar.position.y = 0.15;
	radar.parent = root;
	const radarMat = mat(
		scene,
		"turret-radar-mat",
		new Color3(0.3, 0.7, 0.9),
		new Color3(0.2, 0.55, 0.8),
	);
	const spoke = CreateBox(
		"turret-radar-spoke",
		{ width: 0.1, height: 0.05, depth: 4.4 },
		scene,
	);
	spoke.position.z = 2.2;
	spoke.material = radarMat;
	spoke.parent = radar;

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

	// core danger ring: the defensive perimeter the player protects
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
	let recoilSpring = 0; // 0..1, kicked on a shot, relaxes each frame
	let radarAngle = 0;

	return {
		update(state: GameState) {
			// one pass resolves the locked target, the nearest AIMABLE enemy (cloaked
			// hidden-phase enemies excluded so the barrels don't telegraph them), and
			// the nearest enemy overall for the danger ring (any enemy threatens)
			let target: EnemyState | undefined;
			let nearestAimEnemy: EnemyState | undefined;
			let nearestAim = Number.POSITIVE_INFINITY;
			let nearest = Number.POSITIVE_INFINITY;
			for (const e of state.enemies) {
				if (e.id === state.targetId) target = e;
				const d = Math.hypot(e.pos.x, e.pos.y);
				if (d < nearest) nearest = d;
				// aim scan skips cloaked enemies so barrels never point at a target
				// the player can't yet see
				if (!isCloaked(e, state.tick) && d < nearestAim) {
					nearestAim = d;
					nearestAimEnemy = e;
				}
			}
			// aim priority: locked target → nearest enemy (anticipatory) → HOLD
			const aimAt = target ?? nearestAimEnemy;
			if (aimAt) {
				const desired = Math.atan2(aimAt.pos.x, aimAt.pos.y);
				yaw = lerpAngle(yaw, desired, AIM_SLERP);
			}
			barrel.rotation.y = yaw;

			// per-shot recoil: pull both barrels back proportionally, relax each frame
			recoilSpring *= RECOIL_DECAY;
			if (recoilSpring < 0.001) recoilSpring = 0;
			const back = -recoilSpring * 0.5;
			barrelNodes[0].position.z = back;
			barrelNodes[1].position.z = back;

			// combo-scaled core glow: hotter core as the streak climbs, plus a pulse
			const pulse = 0.5 + 0.5 * Math.sin(state.tick * 0.12);
			const comboGain = 1 + Math.min(1.6, state.combo * 0.12);
			const lock = target ? 1.25 : 1;
			const gain = comboGain * lock;
			coreMat.emissiveColor.set(
				0.15 * (1 + pulse) * gain,
				0.55 * (0.7 + pulse * 0.5) * gain,
				0.9 * (0.7 + pulse * 0.5) * gain,
			);
			core.scaling.setAll(
				1 + pulse * 0.08 + Math.min(0.12, state.combo * 0.01),
			);

			// slow independent radar sweep
			radarAngle += 0.02;
			radar.rotation.y = radarAngle;

			if (ringLife > 0) {
				ringLife -= 1;
				const t = 1 - ringLife / RING_LIFE;
				ring.scaling.setAll(1 + t * 5);
				ringMat.alpha = (1 - t) * 0.7;
				if (ringLife === 0) ring.setEnabled(false);
			}

			// core danger ring: nearest enemy proximity drives colour + pulse
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
		recoil(heavy: boolean) {
			const kick = heavy ? 1 : 0.55;
			if (kick > recoilSpring) recoilSpring = kick;
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
