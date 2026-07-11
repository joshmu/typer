import type { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { getArchetype } from "../content/enemies";
import { isCloaked } from "../sim/abilities";
import type { GameState } from "../sim/state";
import { buildEnemyModel, type EnemyModel } from "./enemy-models";
import { drawLabel } from "./label";
import { tierTint, visualFor } from "./visuals";

// overall enemy model scale on top of archetype size — makes silhouettes read
// at top-down gameplay zoom (playtest: "basic pixels", enemies too small)
const MODEL_SCALE = 2.2;

type EnemyVisual = {
	root: TransformNode;
	model: EnemyModel;
	mat: StandardMaterial;
	baseEmissive: Color3;
	phase: number;
	label: Mesh;
	texture: DynamicTexture;
	lastText: string;
};

/** Stable per-id animation phase so a family's models don't bob in lockstep. */
function idPhase(id: number): number {
	const h = (Math.imul(id, 0x9e3779b1) >>> 0) / 4294967296;
	return h * Math.PI * 2;
}

export function createEnemyRenderer(scene: Scene, glow: GlowLayer) {
	const visuals = new Map<number, EnemyVisual>();

	function create(id: number, archetypeId: string): EnemyVisual {
		const arch = getArchetype(archetypeId);
		const recipe = visualFor(archetypeId);
		const root = new TransformNode(`enemy-${id}`, scene);

		const mat = new StandardMaterial(`enemy-${id}-mat`, scene);
		mat.diffuseColor = new Color3(...tierTint(recipe.color, arch.tier));
		const baseEmissive = new Color3(...recipe.emissive);
		mat.emissiveColor = baseEmissive.clone();
		mat.specularColor = new Color3(0.25, 0.25, 0.3);

		const model = buildEnemyModel(scene, recipe, mat);
		model.node.parent = root;
		model.node.scaling.setAll(arch.size * MODEL_SCALE);

		const label = CreatePlane(
			`enemy-${id}-label`,
			{ width: 7, height: 1.75 },
			scene,
		);
		label.parent = root;
		label.position.y = arch.size * MODEL_SCALE + 0.9;
		label.billboardMode = TransformNode.BILLBOARDMODE_ALL;
		const texture = new DynamicTexture(
			`enemy-${id}-tex`,
			{ width: 512, height: 128 },
			scene,
			false,
		);
		texture.hasAlpha = true;
		const labelMat = new StandardMaterial(`enemy-${id}-labelmat`, scene);
		labelMat.diffuseTexture = texture;
		labelMat.emissiveColor = Color3.White();
		labelMat.backFaceCulling = false;
		label.material = labelMat;
		glow.addExcludedMesh(label); // word plates stay crisp, never bloomed

		return {
			root,
			model,
			mat,
			baseEmissive,
			phase: idPhase(id),
			label,
			texture,
			lastText: "",
		};
	}

	return {
		sync(state: GameState) {
			// state carries only live enemies; dispose visuals whose enemy is gone
			const present = new Set(state.enemies.map((e) => e.id));
			for (const [id, v] of visuals) {
				if (!present.has(id)) {
					v.root.dispose(false, true);
					visuals.delete(id);
				}
			}
			for (const e of state.enemies) {
				let v = visuals.get(e.id);
				if (!v) {
					v = create(e.id, e.archetypeId);
					visuals.set(e.id, v);
				}
				const isTarget = state.targetId === e.id;
				v.root.position.x = e.pos.x;
				v.root.position.z = e.pos.y;

				// idle animation: bob / spin / orient along velocity / orbit sub-parts
				v.model.animate(state.tick, v.phase, e.vel);

				// cloak → near-invisible with an alpha shimmer; else fully opaque
				const cloaked = isCloaked(e, state.tick);
				const vis = cloaked
					? 0.12 + 0.06 * (0.5 + 0.5 * Math.sin(state.tick * 0.4 + v.phase))
					: 1;
				for (const p of v.model.parts) p.visibility = vis;

				// locked target glows: boost the base emissive rather than replacing
				// it, so each family keeps its hue; its label plate also grows
				v.mat.emissiveColor.copyFrom(v.baseEmissive);
				if (isTarget) v.mat.emissiveColor.scaleInPlace(2.4);
				v.label.scaling.setAll(isTarget ? 1.25 : 1);
				drawLabel(v, e.word, e.typedCount, isTarget);
			}
		},
		dispose() {
			for (const v of visuals.values()) v.root.dispose(false, true);
			visuals.clear();
		},
	};
}
