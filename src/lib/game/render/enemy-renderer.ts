import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateIcoSphere } from "@babylonjs/core/Meshes/Builders/icoSphereBuilder";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { getArchetype } from "../content/enemies";
import { isCloaked } from "../sim/abilities";
import type { GameState } from "../sim/state";
import { drawLabel } from "./label";
import { type EnemyShape, tierScale, visualFor } from "./visuals";

type EnemyVisual = {
	root: TransformNode;
	body: Mesh;
	mat: StandardMaterial;
	baseEmissive: Color3;
	label: Mesh;
	texture: DynamicTexture;
	lastText: string;
};

function createBody(
	shape: EnemyShape,
	name: string,
	size: number,
	scene: Scene,
): Mesh {
	switch (shape) {
		case "box":
			return CreateBox(name, { size }, scene);
		case "capsule":
			return CreateCapsule(
				name,
				{ radius: size * 0.35, height: size, tessellation: 12 },
				scene,
			);
		case "torus":
			return CreateTorus(
				name,
				{ diameter: size, thickness: size * 0.35, tessellation: 20 },
				scene,
			);
		case "cone":
			return CreateCylinder(
				name,
				{ height: size, diameterTop: 0, diameterBottom: size },
				scene,
			);
		case "icosphere":
			return CreateIcoSphere(
				name,
				{ radius: size / 2, subdivisions: 2 },
				scene,
			);
		default:
			return CreateSphere(name, { diameter: size }, scene);
	}
}

export function createEnemyRenderer(scene: Scene) {
	const visuals = new Map<number, EnemyVisual>();

	function create(id: number, archetypeId: string): EnemyVisual {
		const arch = getArchetype(archetypeId);
		const recipe = visualFor(archetypeId);
		const scale = tierScale(arch.tier);
		const root = new TransformNode(`enemy-${id}`, scene);

		const body = createBody(recipe.shape, `enemy-${id}-body`, arch.size, scene);
		body.parent = root;
		body.scaling.setAll(scale);
		body.position.y = (arch.size / 2) * scale;
		const mat = new StandardMaterial(`enemy-${id}-mat`, scene);
		mat.diffuseColor = new Color3(...recipe.color);
		const baseEmissive = new Color3(...recipe.emissive);
		mat.emissiveColor = baseEmissive.clone();
		body.material = mat;

		const label = CreatePlane(
			`enemy-${id}-label`,
			{ width: 3, height: 0.8 },
			scene,
		);
		label.parent = root;
		label.position.y = arch.size * scale + 0.9;
		label.billboardMode = TransformNode.BILLBOARDMODE_ALL;
		const texture = new DynamicTexture(
			`enemy-${id}-tex`,
			{ width: 256, height: 64 },
			scene,
			false,
		);
		texture.hasAlpha = true;
		const labelMat = new StandardMaterial(`enemy-${id}-labelmat`, scene);
		labelMat.diffuseTexture = texture;
		labelMat.emissiveColor = Color3.White();
		labelMat.backFaceCulling = false;
		label.material = labelMat;

		return { root, body, mat, baseEmissive, label, texture, lastText: "" };
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
				v.body.visibility = isCloaked(e, state.tick) ? 0.15 : 1;
				// locked target glows: boost the base emissive rather than replacing
				// it, so each family keeps its hue
				v.mat.emissiveColor.copyFrom(v.baseEmissive);
				if (isTarget) v.mat.emissiveColor.scaleInPlace(2.4);
				drawLabel(v, e.word, e.typedCount, isTarget);
			}
		},
		dispose() {
			for (const v of visuals.values()) v.root.dispose(false, true);
			visuals.clear();
		},
	};
}
