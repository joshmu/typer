import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { CreatePolyhedron } from "@babylonjs/core/Meshes/Builders/polyhedronBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { GameState, PowerupKind } from "../sim/state";
import { powerupVisual } from "./visuals";

type PowerupVisual = {
	root: TransformNode;
	crystal: Mesh;
	ring: Mesh;
	mat: StandardMaterial;
	baseEmissive: Color3;
	label: Mesh;
	texture: DynamicTexture;
	lastText: string;
};

const CRYSTAL_Y = 1.1; // hover the pickup above the arena floor

/**
 * Pooled renderer for powerup pickups. Mirrors the enemy renderer's discipline:
 * one visual per pickup id, disposed the moment the pickup leaves state, and a
 * label redrawn only when its visible content changes. The mesh — a spinning
 * crystal (octahedron) wrapped in a halo torus with a pulsing emissive — reads
 * as a distinct "beneficial pickup", never confusable with an enemy.
 */
export function createPowerupRenderer(scene: Scene) {
	const visuals = new Map<number, PowerupVisual>();

	function create(id: number, kind: PowerupKind): PowerupVisual {
		const recipe = powerupVisual(kind);
		const root = new TransformNode(`powerup-${id}`, scene);

		const mat = new StandardMaterial(`powerup-${id}-mat`, scene);
		mat.diffuseColor = new Color3(...recipe.color);
		const baseEmissive = new Color3(...recipe.emissive);
		mat.emissiveColor = baseEmissive.clone();

		const crystal = CreatePolyhedron(
			`powerup-${id}-crystal`,
			{ type: 1, size: 0.5 },
			scene,
		);
		crystal.parent = root;
		crystal.position.y = CRYSTAL_Y;
		crystal.material = mat;

		const ring = CreateTorus(
			`powerup-${id}-ring`,
			{ diameter: 1.6, thickness: 0.12, tessellation: 24 },
			scene,
		);
		ring.parent = root;
		ring.position.y = CRYSTAL_Y;
		ring.material = mat;

		const label = CreatePlane(
			`powerup-${id}-label`,
			{ width: 3, height: 0.8 },
			scene,
		);
		label.parent = root;
		label.position.y = CRYSTAL_Y + 1.2;
		label.billboardMode = TransformNode.BILLBOARDMODE_ALL;
		const texture = new DynamicTexture(
			`powerup-${id}-tex`,
			{ width: 256, height: 64 },
			scene,
			false,
		);
		texture.hasAlpha = true;
		const labelMat = new StandardMaterial(`powerup-${id}-labelmat`, scene);
		labelMat.diffuseTexture = texture;
		labelMat.emissiveColor = Color3.White();
		labelMat.backFaceCulling = false;
		label.material = labelMat;

		return {
			root,
			crystal,
			ring,
			mat,
			baseEmissive,
			label,
			texture,
			lastText: "",
		};
	}

	// same label-draw path as the enemy renderer: typed prefix in amber, the rest
	// white (locked) or grey — redrawn only when the visible content changes
	function drawLabel(
		v: PowerupVisual,
		word: string,
		typedCount: number,
		isTarget: boolean,
	) {
		const text = `${word}:${typedCount}:${isTarget ? 1 : 0}`;
		if (text === v.lastText) return;
		v.lastText = text;
		const ctx = v.texture.getContext();
		ctx.clearRect(0, 0, 256, 64);
		// biome-ignore lint/suspicious/noExplicitAny: ICanvasRenderingContext lacks font metrics typing
		const c = ctx as any;
		c.font = isTarget ? "bold 44px monospace" : "bold 36px monospace";
		const typed = word.slice(0, typedCount);
		const rest = word.slice(typedCount);
		const typedW = c.measureText(typed).width;
		const totalW = typedW + c.measureText(rest).width;
		const x = (256 - totalW) / 2;
		const y = 44;
		c.fillStyle = "#facc15";
		c.fillText(typed, x, y);
		c.fillStyle = isTarget ? "#ffffff" : "#9ca3af";
		c.fillText(rest, x + typedW, y);
		v.texture.update();
	}

	return {
		sync(state: GameState) {
			const present = new Set(state.powerups.map((p) => p.id));
			for (const [id, v] of visuals) {
				if (!present.has(id)) {
					v.root.dispose(false, true);
					visuals.delete(id);
				}
			}
			// pulse phase shared across pickups; render-layer trig is fine here
			const pulse = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(state.tick * 0.12));
			const spin = state.tick * 0.05;
			for (const p of state.powerups) {
				let v = visuals.get(p.id);
				if (!v) {
					v = create(p.id, p.kind);
					visuals.set(p.id, v);
				}
				const isTarget = state.targetPowerupId === p.id;
				v.root.position.x = p.pos.x;
				v.root.position.z = p.pos.y;
				v.crystal.rotation.y = spin;
				v.ring.rotation.y = -spin;
				// locked pickup burns brighter; otherwise a gentle idle pulse
				const gain = pulse * (isTarget ? 2.2 : 1);
				v.mat.emissiveColor.copyFrom(v.baseEmissive);
				v.mat.emissiveColor.scaleInPlace(gain);
				drawLabel(v, p.word, p.typedCount, isTarget);
			}
		},
		dispose() {
			for (const v of visuals.values()) v.root.dispose(false, true);
			visuals.clear();
		},
	};
}
