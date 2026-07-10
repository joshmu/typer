import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { getArchetype } from "../content/enemies";
import type { GameState } from "../sim/state";

type EnemyVisual = {
	root: TransformNode;
	label: Mesh;
	texture: DynamicTexture;
	lastText: string;
};

export function createEnemyRenderer(scene: Scene) {
	const visuals = new Map<number, EnemyVisual>();

	function create(id: number, archetypeId: string): EnemyVisual {
		const arch = getArchetype(archetypeId);
		const root = new TransformNode(`enemy-${id}`, scene);
		const body = CreateSphere(
			`enemy-${id}-body`,
			{ diameter: arch.size },
			scene,
		);
		body.parent = root;
		body.position.y = arch.size / 2;
		const mat = new StandardMaterial(`enemy-${id}-mat`, scene);
		mat.diffuseColor = new Color3(0.85, 0.25, 0.3);
		body.material = mat;

		const label = CreatePlane(
			`enemy-${id}-label`,
			{ width: 3, height: 0.8 },
			scene,
		);
		label.parent = root;
		label.position.y = arch.size + 0.9;
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

		return { root, label, texture, lastText: "" };
	}

	function drawLabel(v: EnemyVisual, word: string, typedCount: number) {
		const text = `${word}:${typedCount}`;
		if (text === v.lastText) return;
		v.lastText = text;
		v.texture.drawText(
			word,
			null,
			44,
			"bold 40px monospace",
			typedCount > 0 ? "#facc15" : "#e5e7eb",
			"transparent",
			true,
		);
	}

	return {
		sync(state: GameState) {
			for (const e of state.enemies) {
				let v = visuals.get(e.id);
				if (!e.alive) {
					if (v) {
						v.root.dispose(false, true);
						visuals.delete(e.id);
					}
					continue;
				}
				if (!v) {
					v = create(e.id, e.archetypeId);
					visuals.set(e.id, v);
				}
				v.root.position.x = e.pos.x;
				v.root.position.z = e.pos.y;
				drawLabel(v, e.word, e.typedCount);
			}
		},
		dispose() {
			for (const v of visuals.values()) v.root.dispose(false, true);
			visuals.clear();
		},
	};
}
