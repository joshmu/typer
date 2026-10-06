import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, type Vector3 } from "@babylonjs/core/Maths/math";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Sprite } from "@babylonjs/core/Sprites/sprite";
import type { SpriteManager } from "@babylonjs/core/Sprites/spriteManager";
import type { Scene } from "@babylonjs/core/scene";
import type { GameState } from "../sim/state";
import { REF_PPU } from "../view";
import { FIELD_GROUP } from "./scene";
import { spriteAngle } from "./sprite-angle";
import { CELLS } from "./sprite-atlas";

const MUZZLE_Y = 1.2; // height the shots leave from (matches the sprite plane)
// the hero's 64px art at exactly 64 CSS px on the reference canvas: an integer
// 2 device px per art px on a 2x display
const HERO_SIZE = 64 / REF_PPU;
// the barrel tip sits ~45% of the sprite out from its centre
const MUZZLE_LEN = HERO_SIZE * 0.45;
const RING_MS = 370; // how long a ring pulse spreads
const RING_SPREAD = 5; // scale a ring pulse grows by
const RECOIL_MS = 50; // how long the hero stays squashed after a shot
// recoil squash. The atlas's recoil cell is a different turret design, so
// the hero keeps its idle cell and kicks by scale instead.
const RECOIL_SCALE = 0.92;

export type Turret = {
	/** Advance the recoil / ring / danger animations to `now` (ms). Heading
	 * is untouched here — it belongs to `fire` alone. */
	update(state: GameState, now: number): void;
	/** World position of the muzzle along the CURRENT heading, into `out`. */
	getMuzzle(out: Vector3): Vector3;
	/** Fire toward a world point: snap the hero's heading there (last-shot
	 * heading — never re-anchors on its own) and kick the recoil squash. */
	fire(x: number, z: number, now: number): void;
	/** A radial ring pulse from the hero: a powerup activating, or the combo
	 * climbing a tier (in --primary, wider). */
	ringPulse(kind: "powerup" | "tier", now: number): void;
	dispose(): void;
};

function mat(scene: Scene, name: string, emissive: Color3) {
	const m = new StandardMaterial(name, scene);
	m.diffuseColor = new Color3(0, 0, 0);
	m.emissiveColor = emissive;
	m.disableLighting = true;
	return m;
}

/**
 * The player: a top-down pixel-art marine/turret sprite at the arena core. Its
 * heading is the LAST-SHOT heading — it changes ONLY when a shot fires (`fire`)
 * and simply HOLDS otherwise; it never tracks a locked target or re-anchors to
 * the nearest enemy on its own (explicit playtest feedback: the hero keeps
 * facing whatever it last shot at). The hero squashes briefly on each shot. Two
 * flat rings (drawn on the ground plane) survive from the old turret: a powerup
 * activation pulse and a danger perimeter that heats from --primary to --error
 * as the horde presses in.
 */
/** Theme colours the turret is drawn in (read once per run). */
export type TurretTint = { primary: Color3; error: Color3; plate: Color3 };

export function createTurret(
	scene: Scene,
	manager: SpriteManager,
	tint: TurretTint,
): Turret {
	// a dark mount with a --primary rim under the hero, so the grey turret
	// reads as a clear silhouette against the deck
	const mount = CreateDisc(
		"turret-mount",
		{ radius: HERO_SIZE * 0.47, tessellation: 48 },
		scene,
	);
	mount.rotation.x = Math.PI / 2;
	mount.position.y = 0.08;
	mount.renderingGroupId = FIELD_GROUP;
	mount.material = mat(scene, "turret-mount-mat", tint.plate.scale(0.6));
	const rim = CreateTorus(
		"turret-rim",
		{ diameter: HERO_SIZE * 0.96, thickness: 0.09, tessellation: 64 },
		scene,
	);
	rim.position.y = 0.1;
	rim.renderingGroupId = FIELD_GROUP;
	rim.material = mat(scene, "turret-rim-mat", tint.primary.scale(0.85));

	const hero = new Sprite("hero", manager);
	hero.cellIndex = CELLS.heroIdle;
	hero.isPickable = false;
	hero.width = HERO_SIZE;
	hero.height = HERO_SIZE;
	hero.position.set(0, MUZZLE_Y, 0);

	// pooled powerup ring pulse (flat on the ground)
	const ring = CreateTorus(
		"turret-ring",
		{ diameter: 1.2, thickness: 0.12, tessellation: 40 },
		scene,
	);
	ring.renderingGroupId = FIELD_GROUP;
	// torus lies flat in XZ by default → reads as a circle on the ground under the
	// overhead ortho camera (a standing ring would collapse to an edge-on line)
	ring.position.y = 0.3;
	const powerupRing = new Color3(0.4, 0.85, 1);
	const ringMat = mat(scene, "turret-ring-mat", powerupRing);
	ringMat.alpha = 0;
	ring.material = ringMat;
	ring.setEnabled(false);
	let ringAt = -1;
	let ringSpread = RING_SPREAD;

	// red danger perimeter the player defends
	const danger = CreateTorus(
		"turret-danger",
		{ diameter: HERO_SIZE * 1.5, thickness: 0.1, tessellation: 64 },
		scene,
	);
	danger.renderingGroupId = FIELD_GROUP;
	danger.position.y = 0.12; // flat on the ground (see ring above)
	const dangerMat = mat(scene, "turret-danger-mat", tint.primary.scale(0.5));
	const dangerColor = new Color3();
	danger.material = dangerMat;

	// heading unit vector in world (sim) space; starts facing "north" (up-screen).
	// `fire` is the sole writer — the sprite holds this heading between shots.
	let hx = 0;
	let hz = -1;
	hero.angle = spriteAngle(hx, hz);
	let recoilAt = -1;

	function setHeading(x: number, z: number): void {
		const len = Math.hypot(x, z);
		if (len < 1e-6) return;
		hx = x / len;
		hz = z / len;
	}

	return {
		update(state: GameState, now: number) {
			// recoil: a brief squash after each shot
			const recoiling = recoilAt >= 0 && now - recoilAt < RECOIL_MS;
			const size = recoiling ? HERO_SIZE * RECOIL_SCALE : HERO_SIZE;
			hero.width = size;
			hero.height = size;

			if (ringAt >= 0) {
				const t = (now - ringAt) / RING_MS;
				if (t >= 1) {
					ringAt = -1;
					ring.setEnabled(false);
				} else {
					const e = 1 - (1 - t) * (1 - t);
					ring.scaling.setAll(1 + e * ringSpread);
					ringMat.alpha = (1 - t) * 0.8;
				}
			}

			// danger ring: nearest enemy proximity drives colour + pulse
			let nearest = Number.POSITIVE_INFINITY;
			for (const e of state.enemies) {
				const d = Math.hypot(e.pos.x, e.pos.y);
				if (d < nearest) nearest = d;
			}
			const threat = nearest < 6 ? 1 - nearest / 6 : 0;
			const beat = 0.5 + 0.5 * Math.sin(state.tick * (0.1 + threat * 0.25));
			const glow = 0.35 + beat * (0.25 + threat * 0.7);
			// --primary at rest, heating to --error as the horde closes in
			Color3.LerpToRef(tint.primary, tint.error, threat, dangerColor);
			dangerColor.scaleToRef(glow * 1.4, dangerMat.emissiveColor);
		},
		getMuzzle(out: Vector3): Vector3 {
			out.set(hx * MUZZLE_LEN, MUZZLE_Y, hz * MUZZLE_LEN);
			return out;
		},
		fire(x: number, z: number, now: number) {
			setHeading(x, z);
			hero.angle = spriteAngle(hx, hz);
			recoilAt = now;
		},
		ringPulse(kind, now) {
			ringAt = now;
			ringSpread = kind === "tier" ? RING_SPREAD * 2.4 : RING_SPREAD;
			ringMat.emissiveColor.copyFrom(
				kind === "tier" ? tint.primary : powerupRing,
			);
			ring.setEnabled(true);
			ring.scaling.setAll(1);
			ringMat.alpha = 0.8;
		},
		dispose() {
			hero.dispose();
			(mount as Mesh).dispose(false, true);
			(rim as Mesh).dispose(false, true);
			(ring as Mesh).dispose(false, true);
			(danger as Mesh).dispose(false, true);
		},
	};
}
