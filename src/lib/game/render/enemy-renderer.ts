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
import { getArchetype, isBoss } from "../content/enemies";
import { isCloaked } from "../sim/abilities";
import type { GameState } from "../sim/state";
import { spawnFade } from "../view";
import { drawStackedLabel, FONT_IDLE, type PlateFlash } from "./label";
import { labelRows } from "./label-rows";
import { FIELD_GROUP, type SceneView } from "./scene";
import { spriteAngle } from "./sprite-angle";
import { walkCells } from "./sprite-atlas";

// World-unit size of a size-1 archetype sprite: ~50 CSS px on the reference
// canvas (~13 px/unit), ~0.8 CSS px per art px. Archetype size is compressed
// (size^0.75) so the smallest creatures stay readable and bosses don't swamp
// the frame.
const ENEMY_SPRITE_SCALE = 3.8;
const SIZE_CURVE = 0.75;
const BOSS_SCALE = 1.05; // bosses are already large by archetype size
const SPRITE_Y = 1.2; // lift sprites above the ground/decals
const LABEL_Y = 2.4; // draw label planes above the sprites
// world distance travelled between the two walk cells — a chunky, readable gait
const WALK_STEP = 0.5;

// Label plane geometry. The texture is 512×768 — six 128px rows: the CURRENT
// word plate sits in the bottom row (its centre hangs LABEL_ROW_DROP below the
// plane centre), up to four queued words stack above it, and the top row holds
// the overflow chip. The plane is positioned so the bottom plate lands a small
// gap above the sprite's top edge (under the top-down ortho camera, +z is
// screen-up). The whole label is then scaled per frame so text keeps a fixed
// on-screen size whatever the camera zoom (labelScale).
const LABEL_PLANE_W = 7;
const LABEL_TEX_W = 512;
const LABEL_TEX_H = 768;
const LABEL_PLANE_H = LABEL_PLANE_W * (LABEL_TEX_H / LABEL_TEX_W); // 10.5
const LABEL_ROW_W = (128 / LABEL_TEX_H) * LABEL_PLANE_H; // one row in world units
const LABEL_ROW_DROP = LABEL_PLANE_H / 2 - LABEL_ROW_W / 2;
// half the plate height in world units (104px plate row)
const LABEL_PLATE_HALF = (104 / LABEL_TEX_H) * (LABEL_PLANE_H / 2);
const LABEL_GAP = 0.35; // clearance between sprite top edge and plate bottom
// idle glyph em height in world units at label scale 1
const IDLE_FONT_WORLD = (FONT_IDLE / LABEL_TEX_W) * LABEL_PLANE_W;

/** Scale a label plane so its idle glyphs land at `view.fontPx` on screen. */
export function labelScale(view: SceneView): number {
	return view.fontPx / (IDLE_FONT_WORLD * view.ppu);
}

type EnemyVisual = {
	sprite: Sprite;
	cells: readonly [number, number];
	label: Mesh;
	labelMat: StandardMaterial;
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
	// half the rendered sprite size: the label's bottom plate floats just above it
	spriteHalf: number;
	phase: number;
	isBoss: boolean;
	// wall-clock end of the front plate's absorb flash (0 = none) and its kind
	flashUntil: number;
	flash: PlateFlash;
};

// how long the front plate rings after an absorbed completion
const FLASH_MS = 180;

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
	view: SceneView,
) {
	const visuals = new Map<number, EnemyVisual>();

	function create(id: number, archetypeId: string): EnemyVisual {
		const arch = getArchetype(archetypeId);
		const family = archetypeId.split("-")[0];
		const boss = isBoss({ archetypeId });
		const cells = boss ? walkCells("boss") : walkCells(family);

		const sprite = new Sprite(`enemy-${id}`, manager);
		sprite.cellIndex = cells[0];
		sprite.isPickable = false;
		sprite.color = new Color4(1, 1, 1, 1); // show the art's own colours untinted

		// tall billboard label: six stacked rows (current word bottom, queue above)
		const labelRoot = new TransformNode(`enemy-${id}-labelroot`, scene);
		const label = CreatePlane(
			`enemy-${id}-label`,
			{ width: LABEL_PLANE_W, height: LABEL_PLANE_H },
			scene,
		);
		label.parent = labelRoot;
		label.renderingGroupId = FIELD_GROUP;
		label.billboardMode = TransformNode.BILLBOARDMODE_ALL;
		// mipmaps ON: the texture renders minified, and without them the text
		// shimmers into mud
		const texture = new DynamicTexture(
			`enemy-${id}-tex`,
			{ width: LABEL_TEX_W, height: LABEL_TEX_H },
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

		const baseSize = arch.size ** SIZE_CURVE * ENEMY_SPRITE_SCALE;
		const renderSize = baseSize * (boss ? BOSS_SCALE : 1);
		return {
			sprite,
			cells,
			label,
			labelMat,
			labelRoot,
			texture,
			lastText: "",
			walkDist: 0,
			lastX: 0,
			lastY: 0,
			lastAngle: 0,
			baseSize,
			spriteHalf: renderSize / 2,
			phase: idPhase(id),
			isBoss: boss,
			flashUntil: 0,
			flash: "none",
		};
	}

	return {
		/** An enemy's completion was absorbed: ring its front plate, red if
		 * armour refused it, otherwise the clang of a shield charge popping. */
		absorbed(id: number, armoured: boolean, now: number) {
			const v = visuals.get(id);
			if (!v) return;
			v.flash = armoured ? "blocked" : "clang";
			v.flashUntil = now + FLASH_MS;
		},
		sync(state: GameState, now: number) {
			const ls = labelScale(view);
			const plateDrop = (LABEL_PLATE_HALF + LABEL_ROW_DROP) * ls;
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
				v.labelRoot.scaling.setAll(ls);
				v.labelRoot.position.set(
					e.pos.x,
					LABEL_Y,
					e.pos.y + v.spriteHalf + LABEL_GAP + plateDrop,
				);

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

				// fresh spawns fade in from the spawn ring; cloak flutters while hidden
				const fade = spawnFade(
					Math.sqrt(e.pos.x * e.pos.x + e.pos.y * e.pos.y),
				);
				let alpha = fade;
				if (e.ability?.kind === "cloak" && isCloaked(e, state.tick)) {
					alpha *=
						0.18 + 0.1 * (0.5 + 0.5 * Math.sin(state.tick * 0.4 + v.phase));
				}
				v.sprite.color.a = alpha;
				v.labelMat.alpha = fade;

				// target emphasis comes from the label draw itself (bigger font, --primary
				// border, chevron) — mesh scaling would shift the bottom-anchored plate
				if (v.flash !== "none" && now >= v.flashUntil) v.flash = "none";
				drawStackedLabel(v, labelRows(e), isTarget, v.flash);
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
