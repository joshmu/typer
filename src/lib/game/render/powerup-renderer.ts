import type { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color4 } from "@babylonjs/core/Maths/math";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Sprite } from "@babylonjs/core/Sprites/sprite";
import type { SpriteManager } from "@babylonjs/core/Sprites/spriteManager";
import type { Scene } from "@babylonjs/core/scene";
import type { GameState, PowerupKind } from "../sim/state";
import { drawLabel } from "./label";
import { CELLS } from "./sprite-atlas";
import { powerupVisual } from "./visuals";

type PowerupVisual = {
	root: TransformNode;
	crystal: Sprite;
	tint: [number, number, number];
	label: Mesh;
	texture: DynamicTexture;
	lastText: string;
};

const CRYSTAL_Y = 1.2; // hover the pickup above the arena floor
const CRYSTAL_SIZE = 3.6;
// Label plane: 512×192 texture on an 11×4.125 plane (matching aspect). The word
// plate sits in the bottom 128px band (chevron headroom above), its centre
// hanging 0.69 world units below the plane centre with a ~1.12-unit half
// height. +z is screen-up under the ortho camera, so this offset floats the
// plate just above the crystal even at its locked 1.25× swell.
const LABEL_UP = (CRYSTAL_SIZE * 1.25) / 2 + 0.5 + 1.12 + 0.69;

/**
 * Pooled renderer for powerup pickups. Mirrors the enemy renderer's discipline:
 * one visual per pickup id, disposed the moment the pickup leaves state, and a
 * label redrawn only when its visible content changes. The pickup is the pixel
 * crystal sprite cell, tinted per kind and gently pulsing — a distinct
 * "beneficial pickup" never confusable with a creature.
 */
export function createPowerupRenderer(
	scene: Scene,
	glow: GlowLayer,
	manager: SpriteManager,
) {
	const visuals = new Map<number, PowerupVisual>();

	function create(id: number, kind: PowerupKind): PowerupVisual {
		const recipe = powerupVisual(kind);
		const root = new TransformNode(`powerup-${id}`, scene);

		const crystal = new Sprite(`powerup-${id}-crystal`, manager);
		crystal.cellIndex = CELLS.crystal;
		crystal.isPickable = false;
		crystal.width = CRYSTAL_SIZE;
		crystal.height = CRYSTAL_SIZE;
		// own the sprite's Color4 once and mutate it per frame (see sync) — the hot
		// path allocates nothing, matching the enemy renderer's discipline
		crystal.color = new Color4(
			recipe.color[0],
			recipe.color[1],
			recipe.color[2],
			1,
		);

		const label = CreatePlane(
			`powerup-${id}-label`,
			{ width: 11, height: 4.125 },
			scene,
		);
		label.parent = root;
		label.position.set(0, CRYSTAL_Y + 1, LABEL_UP);
		label.billboardMode = TransformNode.BILLBOARDMODE_ALL;
		// mipmaps ON + unlit emissive/opacity material — same clarity treatment as
		// the enemy labels (see enemy-renderer): crisp under ortho minification,
		// exact authored colours with no lighting dim
		const texture = new DynamicTexture(
			`powerup-${id}-tex`,
			{ width: 512, height: 192 },
			scene,
			true,
		);
		texture.hasAlpha = true;
		const labelMat = new StandardMaterial(`powerup-${id}-labelmat`, scene);
		labelMat.disableLighting = true;
		labelMat.emissiveTexture = texture;
		labelMat.opacityTexture = texture;
		labelMat.backFaceCulling = false;
		label.material = labelMat;
		glow.addExcludedMesh(label); // word plates stay crisp, never bloomed

		return { root, crystal, tint: recipe.color, label, texture, lastText: "" };
	}

	return {
		sync(state: GameState) {
			const present = new Set(state.powerups.map((p) => p.id));
			for (const [id, v] of visuals) {
				if (!present.has(id)) {
					v.crystal.dispose();
					v.root.dispose(false, true);
					visuals.delete(id);
				}
			}
			// pulse phase shared across pickups; render-layer trig is fine here
			const pulse = 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(state.tick * 0.12));
			for (const p of state.powerups) {
				let v = visuals.get(p.id);
				if (!v) {
					v = create(p.id, p.kind);
					visuals.set(p.id, v);
				}
				const isTarget = state.targetPowerupId === p.id;
				v.root.position.set(p.pos.x, CRYSTAL_Y, p.pos.y);
				v.crystal.position.set(p.pos.x, CRYSTAL_Y, p.pos.y);
				// locked pickup burns brighter and swells; otherwise a gentle idle pulse.
				// mutate the sprite's own Color4 in place — no per-frame allocation
				const gain = Math.min(1, pulse * (isTarget ? 1.3 : 1));
				v.crystal.color.set(
					v.tint[0] * gain + (1 - gain),
					v.tint[1] * gain + (1 - gain),
					v.tint[2] * gain + (1 - gain),
					1,
				);
				const size = CRYSTAL_SIZE * (isTarget ? 1.25 : 1);
				v.crystal.width = size;
				v.crystal.height = size;
				v.label.scaling.setAll(isTarget ? 1.25 : 1);
				drawLabel(v, p.word, p.typedCount, isTarget);
			}
		},
		dispose() {
			for (const v of visuals.values()) {
				v.crystal.dispose();
				v.root.dispose(false, true);
			}
			visuals.clear();
		},
	};
}
