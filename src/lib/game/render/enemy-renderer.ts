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
import { getArchetype } from "../content/enemies";
import { isCloaked } from "../sim/abilities";
import type { GameState } from "../sim/state";
import { drawStackedLabel } from "./label";
import { spriteAngle } from "./sprite-angle";
import { walkCells } from "./sprite-atlas";

// World-unit size of a size-1 archetype sprite. Tuned for top-down readability
// under the ortho camera (playtest: enemies were "basic pixels", too small).
// Playtest 2026-07-12: the first pass (scale 6) filled the frame with giant
// creatures — the whole render scale read ~3× too big against the arena, so
// sprites/labels/effects were brought down together (camera and sim untouched).
const ENEMY_SPRITE_SCALE = 2;
const BOSS_SCALE = 1.2; // bosses render larger on top of their bigger size (1.6 read oversized)
const SPRITE_Y = 1.2; // lift sprites above the ground/decals
const LABEL_Y = 2.4; // draw label planes above the sprites
// world distance travelled between the two walk cells — a chunky, readable gait
const WALK_STEP = 0.4;

// Label plane geometry. The plane is 4 stacked texture rows tall; the CURRENT
// word plate sits in the bottom row, so its centre hangs LABEL_ROW_DROP below
// the plane centre. The plane is positioned so that plate lands a small gap
// above the sprite's top edge — under the top-down ortho camera, +z is
// screen-up (the old -3.2 offset plus the row drop put labels ~7 units BELOW
// the enemy, the "strange space" playtest complaint).
// Label planes shrink LESS than the sprites (7, not ~3.7): they are UI, and the
// word must stay readable (~14px on a ~970px-tall canvas) over the smaller art.
const LABEL_PLANE_SIZE = 7;
const LABEL_ROW_DROP = LABEL_PLANE_SIZE / 2 - LABEL_PLANE_SIZE / 8;
// half the plate height in world units (104px plate of a 512px texture)
const LABEL_PLATE_HALF = (104 / 512) * (LABEL_PLANE_SIZE / 2);
const LABEL_GAP = 0.35; // clearance between sprite top edge and plate bottom

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
	// last facing angle, held while velocity is negligible so a paused enemy (e.g.
	// a charger mid dash-pause) never snaps to 0 — honours spriteAngle's contract
	// that callers keep the previous value at near-zero velocity.
	lastAngle: number;
	// world-unit sprite size (archetype size × scale), resolved once at create so
	// sync never re-reads the archetype table per frame
	baseSize: number;
	// screen-up world offset from the enemy to the label plane centre, chosen so
	// the bottom-row word plate floats just above the sprite (see LABEL_* consts)
	labelUp: number;
	phase: number;
	isBoss: boolean;
};

// squared-velocity threshold below which facing is held (matches sprite-angle's
// own negligible-velocity guard)
const FACING_EPSILON_SQ = 1e-8;

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
			{ width: LABEL_PLANE_SIZE, height: LABEL_PLANE_SIZE },
			scene,
		);
		label.parent = labelRoot;
		label.billboardMode = TransformNode.BILLBOARDMODE_ALL;
		// mipmaps ON: the 512px texture renders ~5-6× minified under the ortho zoom,
		// and without them the text shimmers into mud (HUD-vs-label clarity gap)
		const texture = new DynamicTexture(
			`enemy-${id}-tex`,
			{ width: 512, height: 512 },
			scene,
			true,
		);
		texture.hasAlpha = true;
		// unlit: emissive+opacity from the texture so plates render at exactly the
		// authored colours — diffuse-under-hemispheric-light dimmed the text before
		const labelMat = new StandardMaterial(`enemy-${id}-labelmat`, scene);
		labelMat.disableLighting = true;
		labelMat.emissiveTexture = texture;
		labelMat.opacityTexture = texture;
		labelMat.backFaceCulling = false;
		label.material = labelMat;
		glow.addExcludedMesh(label); // word plates stay crisp, never bloomed

		const baseSize = arch.size * ENEMY_SPRITE_SCALE;
		const renderSize = baseSize * (isBoss ? BOSS_SCALE : 1);
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
			lastAngle: 0,
			baseSize,
			labelUp: renderSize / 2 + LABEL_GAP + LABEL_PLATE_HALF + LABEL_ROW_DROP,
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
				const isTarget = state.targetId === e.id;

				// position the sprite flat on the field; label floats above it on screen
				v.sprite.position.set(e.pos.x, SPRITE_Y, e.pos.y);
				v.labelRoot.position.set(e.pos.x, LABEL_Y, e.pos.y + v.labelUp);

				// face travel direction (sim velocity) — a creature walking forward.
				// Hold the last angle while velocity is negligible so a paused enemy
				// keeps its heading instead of snapping to 0 (spriteAngle returns 0 at
				// near-zero velocity, expecting the caller to keep the prior value).
				if (e.vel.x * e.vel.x + e.vel.y * e.vel.y > FACING_EPSILON_SQ) {
					v.lastAngle = spriteAngle(e.vel.x, e.vel.y);
				}
				v.sprite.angle = v.lastAngle;

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
				let size = v.baseSize;
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

				// target emphasis comes from the label draw itself (bigger font, amber
				// border, chevron) — mesh scaling would shift the bottom-anchored plate
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
