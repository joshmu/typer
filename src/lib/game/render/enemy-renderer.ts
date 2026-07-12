import type { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3, Color4 } from "@babylonjs/core/Maths/math";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Sprite } from "@babylonjs/core/Sprites/sprite";
import type { SpriteManager } from "@babylonjs/core/Sprites/spriteManager";
import type { Scene } from "@babylonjs/core/scene";
import { getArchetype } from "../content/enemies";
import { isCloaked } from "../sim/abilities";
import type { GameState } from "../sim/state";
import { drawStackedLabel } from "./label";
import { spriteAngle } from "./sprite-angle";
import { walkCells } from "./sprite-atlas";

// World-unit size of a size-1 archetype sprite. Tuned for top-down readability
// under the ortho camera (playtest: enemies were "basic pixels", too small).
const ENEMY_SPRITE_SCALE = 6;
const BOSS_SCALE = 1.6; // bosses render notably larger on top of their bigger size
const SPRITE_Y = 1.2; // lift sprites above the ground/decals
const LABEL_Y = 2.4; // draw label planes above the sprites
// world offset (screen-up) that floats the label above the creature's body
const LABEL_OFFSET = 3.2;
// world distance travelled between the two walk cells — a chunky, readable gait
const WALK_STEP = 1.1;

type EnemyVisual = {
	sprite: Sprite;
	cells: readonly [number, number];
	label: Mesh;
	labelRoot: TransformNode;
	texture: DynamicTexture;
	lastText: string;
	walkDist: number;
	lastX: number;
	lastY: number;
	phase: number;
	isBoss: boolean;
};

/** Stable per-id phase so a family's sprites don't pulse in lockstep. */
function idPhase(id: number): number {
	const h = (Math.imul(id, 0x9e3779b1) >>> 0) / 4294967296;
	return h * Math.PI * 2;
}

export function createEnemyRenderer(
	scene: Scene,
	glow: GlowLayer,
	manager: SpriteManager,
) {
	const visuals = new Map<number, EnemyVisual>();

	function create(id: number, archetypeId: string): EnemyVisual {
		const arch = getArchetype(archetypeId);
		const family = archetypeId.split("-")[0];
		const isBoss = arch.role === "boss";
		const cells = isBoss ? walkCells("boss") : walkCells(family);

		const sprite = new Sprite(`enemy-${id}`, manager);
		sprite.cellIndex = cells[0];
		sprite.isPickable = false;
		sprite.color = new Color4(1, 1, 1, 1); // show the art's own colours untinted

		// tall billboard label: four stacked rows (current word bottom, queued above)
		const labelRoot = new TransformNode(`enemy-${id}-labelroot`, scene);
		const label = CreatePlane(
			`enemy-${id}-label`,
			{ width: 11, height: 11 },
			scene,
		);
		label.parent = labelRoot;
		label.billboardMode = TransformNode.BILLBOARDMODE_ALL;
		const texture = new DynamicTexture(
			`enemy-${id}-tex`,
			{ width: 512, height: 512 },
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
			sprite,
			cells,
			label,
			labelRoot,
			texture,
			lastText: "",
			walkDist: 0,
			lastX: 0,
			lastY: 0,
			phase: idPhase(id),
			isBoss,
		};
	}

	return {
		sync(state: GameState) {
			const present = new Set(state.enemies.map((e) => e.id));
			for (const [id, v] of visuals) {
				if (!present.has(id)) {
					v.sprite.dispose();
					v.labelRoot.dispose(false, true);
					visuals.delete(id);
				}
			}
			for (const e of state.enemies) {
				let v = visuals.get(e.id);
				if (!v) {
					v = create(e.id, e.archetypeId);
					v.lastX = e.pos.x;
					v.lastY = e.pos.y;
					visuals.set(e.id, v);
				}
				const arch = getArchetype(e.archetypeId);
				const isTarget = state.targetId === e.id;

				// position the sprite flat on the field; label floats above it on screen
				v.sprite.position.set(e.pos.x, SPRITE_Y, e.pos.y);
				v.labelRoot.position.set(e.pos.x, LABEL_Y, e.pos.y - LABEL_OFFSET);

				// face travel direction (sim velocity) — a creature walking forward
				v.sprite.angle = spriteAngle(e.vel.x, e.vel.y);

				// walk-cycle: alternate the two pose cells by distance travelled so a
				// faster enemy visibly steps faster and a stopped one holds a pose
				const dx = e.pos.x - v.lastX;
				const dy = e.pos.y - v.lastY;
				v.walkDist += Math.sqrt(dx * dx + dy * dy);
				v.lastX = e.pos.x;
				v.lastY = e.pos.y;
				const frame = Math.floor(v.walkDist / WALK_STEP) % 2;
				v.sprite.cellIndex = v.cells[frame];

				// size: archetype size × scale (bosses ×2), with a slow menacing boss
				// pulse; the locked target swells slightly so it reads as acquired
				let size = arch.size * ENEMY_SPRITE_SCALE;
				if (v.isBoss) {
					size *=
						BOSS_SCALE * (1 + 0.06 * Math.sin(state.tick * 0.05 + v.phase));
				}
				if (isTarget) size *= 1.12;
				v.sprite.width = size;
				v.sprite.height = size;

				// cloak → alpha flutter while hidden; else fully opaque
				if (e.ability?.kind === "cloak") {
					v.sprite.color.a = isCloaked(e, state.tick)
						? 0.18 + 0.1 * (0.5 + 0.5 * Math.sin(state.tick * 0.4 + v.phase))
						: 1;
				}

				v.label.scaling.setAll(isTarget ? 1.12 : 1);
				drawStackedLabel(v, e.words, e.wordIndex, e.typedCount, isTarget);
			}
		},
		dispose() {
			for (const v of visuals.values()) {
				v.sprite.dispose();
				v.labelRoot.dispose(false, true);
			}
			visuals.clear();
		},
	};
}
