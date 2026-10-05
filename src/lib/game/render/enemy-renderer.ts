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
import {
	drawStackedLabel,
	FONT_IDLE,
	FONT_TARGET,
	MAX_STACK,
	type PlateFlash,
} from "./label";
import { type LabelBox, layoutLabels } from "./label-layout";
import { type LabelRow, labelRows } from "./label-rows";
import { LABEL_GROUP, type SceneView } from "./scene";
import { spriteAngle } from "./sprite-angle";
import { walkCells } from "./sprite-atlas";

// World-unit size of a size-1 archetype sprite: ~61 CSS px on the reference
// canvas (~12 px/unit), ~1 CSS px per art px. Archetype size is compressed
// (size^0.6) so the smallest creatures stay readable and bosses don't swamp
// the frame.
const ENEMY_SPRITE_SCALE = 5;
const SIZE_CURVE = 0.6;
const BOSS_SCALE = 1.05; // bosses are already large by archetype size
const SPRITE_Y = 1.2; // lift sprites above the ground/decals
const LABEL_Y = 2.4; // draw label planes above the sprites
// world distance per step of the gait, and the sway (radians) at each step
const WALK_STEP = 0.5;
const WADDLE = 0.08;

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
	// last typed hit: when, and how hard it knocks the sprite back
	hitAt: number;
	knock: number;
	// typed progress last frame, and when the newest letter landed
	lastTyped: number;
	popAt: number;
	// set when a kill event names this enemy: its sprite plays out a death pop
	killedAt: number;
	// the label rows last drawn (the front word is the one a kill completes)
	rows: readonly LabelRow[];
};

/** A killed enemy's sprite, flashing and swelling before it pops. */
type Dying = {
	sprite: Sprite;
	start: number;
	size: number;
	boss: boolean;
	// the spent word plate, held (flashed) until the shot lands
	label: TransformNode | null;
};

// how long the front plate rings after an absorbed completion
const FLASH_MS = 180;
// a typed hit: the sprite flashes white and is knocked back, render-only
const HIT_FLASH_MS = 60;
const KNOCK_MS = 120;
const KNOCK_LIGHT = 0.12;
const KNOCK_HEAVY = 0.3;
// the newest typed letter pops on the plate
const POP_MS = 150;
// a killed sprite: white flash for the first half, swelling to DIE_SCALE, then gone
const DIE_MS = 100;
const DIE_SCALE = 1.4;
const BOSS_DIE_MS = 260;
// CSS px kept clear of labels under the top HUD (wave, score, hull)
const HUD_SAFE_TOP_PX = 120;

/** Approximate on-screen box of a label stack, in world units at scale `ls`. */
function labelBox(
	x: number,
	bottom: number,
	rows: readonly LabelRow[],
	isTarget: boolean,
	ls: number,
): LabelBox {
	const shown = Math.min(MAX_STACK, rows.length);
	let chars = 0;
	for (let i = 0; i < shown; i++) chars = Math.max(chars, rows[i].word.length);
	const em = IDLE_FONT_WORLD * ls * (isTarget ? FONT_TARGET / FONT_IDLE : 1);
	const icon = rows[0]?.kind === "normal" ? 0 : 0.95;
	const width = (chars * 0.62 + 0.9 + icon) * em;
	const stack = shown + (rows.length > shown ? 1 : 0);
	return { x, bottom, halfW: width / 2, height: stack * LABEL_ROW_W * ls };
}

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
	{ reducedMotion }: { reducedMotion: boolean },
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
		label.renderingGroupId = LABEL_GROUP;
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
			hitAt: -1,
			knock: 0,
			lastTyped: 0,
			popAt: -1,
			killedAt: -1,
			rows: [],
		};
	}

	const dying: Dying[] = [];
	function animateDying(now: number): void {
		for (let i = dying.length - 1; i >= 0; i--) {
			const d = dying[i];
			const ms = d.boss ? BOSS_DIE_MS : DIE_MS;
			const t = (now - d.start) / ms;
			// the killing shot is still in flight
			if (t < 0) continue;
			if (d.label) {
				d.label.dispose(false, true);
				d.label = null;
			}
			if (t >= 1) {
				d.sprite.dispose();
				dying.splice(i, 1);
				continue;
			}
			// reduced motion: flash and fade in place, no swell
			const swell = reducedMotion ? 0 : (DIE_SCALE - 1) * t;
			const size = d.size * (1 + swell);
			d.sprite.width = size;
			d.sprite.height = size;
			const white = t < 0.5 ? 4 : 1 + 3 * (1 - t) * 2;
			d.sprite.color.set(white, white, white, t < 0.5 ? 1 : (1 - t) * 2);
		}
	}

	return {
		/** An enemy's completion was absorbed: ring its front plate, red if
		 * armour refused it, otherwise the clang of a shield charge popping. */
		/** A typed shot landed on this enemy. */
		hit(id: number, heavy: boolean, now: number) {
			const v = visuals.get(id);
			if (!v) return;
			v.hitAt = now;
			v.knock = reducedMotion ? 0 : heavy ? KNOCK_HEAVY : KNOCK_LIGHT;
		},
		/** Length of the word this enemy's plate showed last frame. */
		wordLength(id: number): number | undefined {
			return visuals.get(id)?.rows[0]?.word.length;
		},
		/** This enemy died: its sprite pops instead of vanishing. */
		killed(id: number, now: number) {
			const v = visuals.get(id);
			if (v) v.killedAt = now;
		},
		absorbed(id: number, armoured: boolean, now: number) {
			const v = visuals.get(id);
			if (!v) return;
			v.flash = armoured ? "blocked" : "clang";
			v.flashUntil = now + FLASH_MS;
		},
		sync(state: GameState, now: number) {
			const ls = labelScale(view);
			const plateDrop = (LABEL_PLATE_HALF + LABEL_ROW_DROP) * ls;
			const safeTop = view.halfH - HUD_SAFE_TOP_PX / view.ppu;
			// labels of on-screen enemies, laid out together after the loop
			const laid: { v: EnemyVisual; x: number }[] = [];
			const boxes: LabelBox[] = [];
			const present = new Set(state.enemies.map((e) => e.id));
			for (const [id, v] of visuals) {
				if (!present.has(id)) {
					if (v.killedAt >= 0) {
						// the word reads as spent until the shot lands
						const front = v.rows[0];
						if (front) {
							const spent = v.rows.slice(0, 1);
							spent[0] = { ...front, typed: front.word.length };
							drawStackedLabel(v, spent, true, "clang");
						}
						dying.push({
							sprite: v.sprite,
							start: v.killedAt,
							size: v.sprite.width,
							boss: v.isBoss,
							label: v.labelRoot,
						});
					} else {
						v.sprite.dispose();
						v.labelRoot.dispose(false, true);
					}
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

				// position the sprite flat on the field, knocked back along the
				// shot for a moment; the label floats above it on screen
				const hitT = v.hitAt < 0 ? 1 : (now - v.hitAt) / KNOCK_MS;
				let kx = 0;
				let ky = 0;
				if (hitT < 1) {
					const d = Math.hypot(e.pos.x, e.pos.y) || 1;
					const k = v.knock * (1 - hitT) * (1 - hitT);
					kx = (e.pos.x / d) * k;
					ky = (e.pos.y / d) * k;
				}
				v.sprite.position.set(e.pos.x + kx, SPRITE_Y, e.pos.y + ky);
				v.labelRoot.scaling.setAll(ls);
				const rows = labelRows(e);
				v.rows = rows;
				// natural bottom edge of the label: just above the sprite
				const natural = e.pos.y + v.spriteHalf + LABEL_GAP;
				if (e.pos.y - v.spriteHalf < view.halfH) {
					const box = labelBox(e.pos.x, natural, rows, isTarget, ls);
					// a label that would run up under the HUD hangs below its
					// sprite instead, so it never detaches from the creature
					if (natural + box.height > safeTop) {
						box.bottom = e.pos.y - v.spriteHalf - LABEL_GAP - box.height;
					}
					laid.push({ v, x: e.pos.x });
					boxes.push(box);
				} else {
					// above the frame: no layout, no HUD clamp
					v.labelRoot.position.set(e.pos.x, LABEL_Y, natural + plateDrop);
				}

				// face travel direction (sim velocity) — a creature walking forward.
				// Hold the last angle while velocity is negligible so a paused enemy
				// keeps its heading instead of snapping to 0 (spriteAngle returns 0 at
				// near-zero velocity, expecting the caller to keep the prior value).
				if (e.vel.x * e.vel.x + e.vel.y * e.vel.y > FACING_EPSILON_SQ) {
					v.lastAngle = spriteAngle(e.vel.x, e.vel.y);
				}
				// gait: a waddle driven by distance travelled, so a faster enemy
				// visibly steps faster and a stopped one holds still. The atlas's two
				// walk cells are different creatures for most families, so the
				// sprite keeps one cell and the gait is a sway instead of a swap.
				const dx = e.pos.x - v.lastX;
				const dy = e.pos.y - v.lastY;
				v.walkDist += Math.sqrt(dx * dx + dy * dy);
				v.lastX = e.pos.x;
				v.lastY = e.pos.y;
				v.sprite.angle =
					v.lastAngle + Math.sin((v.walkDist / WALK_STEP) * Math.PI) * WADDLE;

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
				// a typed hit flashes the sprite white
				const flashT = v.hitAt < 0 ? 1 : (now - v.hitAt) / HIT_FLASH_MS;
				const white = flashT < 1 ? 1 + 3 * (1 - flashT) : 1;
				v.sprite.color.set(white, white, white, alpha);
				v.labelMat.alpha = fade;

				// target emphasis comes from the label draw itself (bigger font, --primary
				// border, chevron) — mesh scaling would shift the bottom-anchored plate
				if (v.flash !== "none" && now >= v.flashUntil) v.flash = "none";
				// the newest typed letter pops (scale steps, so the plate redraws a
				// handful of times per key, not every frame)
				const typed = rows[0]?.typed ?? 0;
				if (typed > v.lastTyped) v.popAt = now;
				v.lastTyped = typed;
				const popT = v.popAt < 0 ? 1 : (now - v.popAt) / POP_MS;
				const pop = popT < 1 ? Math.ceil((1 - popT) * 4) / 4 : 0;
				drawStackedLabel(v, rows, isTarget, v.flash, pop);
			}

			// keep neighbouring labels apart and out from under the HUD. A plate
			// closing in from above is held on its neighbour's top edge, so the
			// lift grows smoothly; no easing, so every frame is overlap-free.
			animateDying(now);
			const ys = layoutLabels(boxes, safeTop);
			for (let i = 0; i < laid.length; i++) {
				laid[i].v.labelRoot.position.set(laid[i].x, LABEL_Y, ys[i] + plateDrop);
			}
		},
		dispose() {
			for (const v of visuals.values()) {
				v.sprite.dispose();
				v.labelRoot.dispose(false, true);
			}
			visuals.clear();
			for (const d of dying) {
				d.sprite.dispose();
				d.label?.dispose(false, true);
			}
			dying.length = 0;
		},
	};
}
