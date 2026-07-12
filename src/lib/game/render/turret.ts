import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, type Vector3 } from "@babylonjs/core/Maths/math";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Sprite } from "@babylonjs/core/Sprites/sprite";
import type { SpriteManager } from "@babylonjs/core/Sprites/spriteManager";
import type { Scene } from "@babylonjs/core/scene";
import type { GameState } from "../sim/state";
import { spriteAngle } from "./sprite-angle";
import { CELLS } from "./sprite-atlas";

const MUZZLE_Y = 1.2; // height the shots leave from (matches the sprite plane)
const MUZZLE_LEN = 3.4; // distance from the hero to the muzzle along its heading
const RING_LIFE = 22; // frames a powerup ring pulse lives
const RECOIL_FRAMES = 3; // frames the recoil sprite cell shows after a shot
const HERO_SIZE = 7.5; // world size of the hero sprite

export type Turret = {
	/** Advance the recoil / ring / danger animations from the sim tick. Heading
	 * is untouched here — it belongs to `fire` alone. */
	update(state: GameState): void;
	/** World position of the muzzle along the CURRENT heading, into `out`. */
	getMuzzle(out: Vector3): Vector3;
	/** Fire toward a world point: snap the hero's heading there (last-shot
	 * heading — never re-anchors on its own) and kick the recoil sprite cell. */
	fire(x: number, z: number): void;
	/** Kick off a radial ring pulse from the hero (powerup activation). */
	ringPulse(): void;
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
 * facing whatever it last shot at). A recoil cell flashes for a few frames on each shot. Two
 * flat rings (drawn on the ground plane) survive from the old turret: a powerup
 * activation pulse and a red danger perimeter that flares as the horde presses in.
 */
export function createTurret(scene: Scene, manager: SpriteManager): Turret {
	const hero = new Sprite("hero", manager);
	hero.cellIndex = CELLS.heroIdle;
	hero.isPickable = false;
	hero.width = HERO_SIZE;
	hero.height = HERO_SIZE;
	hero.position.set(0, MUZZLE_Y, 0);

	// pooled powerup ring pulse (flat on the ground)
	const ring = CreateTorus(
		"turret-ring",
		{ diameter: 2, thickness: 0.18, tessellation: 40 },
		scene,
	);
	// torus lies flat in XZ by default → reads as a circle on the ground under the
	// overhead ortho camera (a standing ring would collapse to an edge-on line)
	ring.position.y = 0.3;
	const ringMat = mat(scene, "turret-ring-mat", new Color3(0.4, 0.85, 1));
	ringMat.alpha = 0;
	ring.material = ringMat;
	ring.setEnabled(false);
	let ringLife = 0;

	// red danger perimeter the player defends
	const danger = CreateTorus(
		"turret-danger",
		{ diameter: 9, thickness: 0.14, tessellation: 64 },
		scene,
	);
	danger.position.y = 0.12; // flat on the ground (see ring above)
	const dangerMat = mat(scene, "turret-danger-mat", new Color3(0.5, 0.4, 0.15));
	danger.material = dangerMat;

	// heading unit vector in world (sim) space; starts facing "north" (up-screen).
	// `fire` is the sole writer — the sprite holds this heading between shots.
	let hx = 0;
	let hz = -1;
	hero.angle = spriteAngle(hx, hz);
	let recoilFrames = 0;

	function setHeading(x: number, z: number): void {
		const len = Math.hypot(x, z);
		if (len < 1e-6) return;
		hx = x / len;
		hz = z / len;
	}

	return {
		update(state: GameState) {
			// recoil cell flashes for a few frames after each shot
			if (recoilFrames > 0) {
				recoilFrames -= 1;
				hero.cellIndex = CELLS.heroRecoil;
			} else {
				hero.cellIndex = CELLS.heroIdle;
			}

			if (ringLife > 0) {
				ringLife -= 1;
				const t = 1 - ringLife / RING_LIFE;
				ring.scaling.setAll(1 + t * 5);
				ringMat.alpha = (1 - t) * 0.7;
				if (ringLife === 0) ring.setEnabled(false);
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
			dangerMat.emissiveColor.set(
				(0.5 + threat * 0.5) * glow * 2,
				(0.4 - threat * 0.35) * glow * 2,
				(0.15 - threat * 0.12) * glow * 2,
			);
		},
		getMuzzle(out: Vector3): Vector3 {
			out.set(hx * MUZZLE_LEN, MUZZLE_Y, hz * MUZZLE_LEN);
			return out;
		},
		fire(x: number, z: number) {
			setHeading(x, z);
			hero.angle = spriteAngle(hx, hz);
			recoilFrames = RECOIL_FRAMES;
		},
		ringPulse() {
			ringLife = RING_LIFE;
			ring.setEnabled(true);
			ring.scaling.setAll(1);
			ringMat.alpha = 0.7;
		},
		dispose() {
			hero.dispose();
			(ring as Mesh).dispose(false, true);
			(danger as Mesh).dispose(false, true);
		},
	};
}
