import type { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import type { LabelRow } from "./label-rows";

/**
 * Anything carrying a word-label texture. Both the enemy and powerup renderers
 * share this shape so they can drive the label-draw paths below.
 */
export type LabelTarget = {
	texture: DynamicTexture;
	// last content string drawn, so redraws are skipped when nothing visible changed
	lastText: string;
};

// Plate metrics shared by both label paths, in texture px. Rows are 128px tall
// in every label texture. The renderers scale the label planes so FONT_IDLE
// lands at the view's plate font size on screen (see view.plateFontPx).
export const FONT_IDLE = 68;
export const FONT_TARGET = 80;
const PLATE_TARGET = 104;
const PLATE_IDLE = 88;
// queued words: smaller and dimmer than the current word, still readable
const QUEUE_SCALE = 0.8;
const QUEUE_ALPHA = 0.8;

// the app's typing face; canvas text falls back to monospace until it loads
export const LABEL_FONT = '"Roboto Mono", ui-monospace, monospace';

/** Theme colours the plates draw with (see refreshLabelTheme). */
type LabelTheme = {
	plate: string;
	ink: string;
	primary: string;
	error: string;
};
let theme: LabelTheme = {
	plate: "#101218",
	ink: "#e6e6e6",
	primary: "#e2b714",
	error: "#ca4754",
};

/**
 * Read the plate palette from the live theme: --primary for typed progress,
 * --error for a completion armour refused,
 * and the theme's bg/text pair arranged dark-plate/light-ink (the arena is
 * always dark). Call once per run; themes don't change mid-run.
 */
export function refreshLabelTheme(
	read: (name: string) => string,
	arrange: (bg: string, text: string) => { plate: string; ink: string },
): void {
	const primary = read("--primary").trim() || theme.primary;
	const error = read("--error").trim() || theme.error;
	theme = { ...arrange(read("--bg"), read("--text")), primary, error };
	fontEpoch += 1; // redraw every plate in the new palette
}

// bumped when the webfont (or palette) changes so every cached plate redraws
let fontEpoch = 0;
let fontRequested = false;

/** Ask the browser for the bold typing face and redraw plates once it lands. */
export function loadLabelFont(): void {
	if (fontRequested || typeof document === "undefined" || !document.fonts) {
		return;
	}
	fontRequested = true;
	void document.fonts
		.load(`bold ${FONT_TARGET}px ${LABEL_FONT}`)
		.then(() => {
			fontEpoch += 1;
		})
		.catch(() => {});
}

// biome-ignore lint/suspicious/noExplicitAny: canvas 2d context, untyped here
type Ctx = any;

function roundRect(
	c: Ctx,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number,
): void {
	c.beginPath();
	c.moveTo(x + r, y);
	c.lineTo(x + w - r, y);
	c.quadraticCurveTo(x + w, y, x + w, y + r);
	c.lineTo(x + w, y + h - r);
	c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
	c.lineTo(x + r, y + h);
	c.quadraticCurveTo(x, y + h, x, y + h - r);
	c.lineTo(x, y + r);
	c.quadraticCurveTo(x, y, x + r, y);
	c.closePath();
}

type PlateOpts = {
	word: string;
	typedCount: number;
	fontPx: number;
	plateH: number;
	alpha: number;
	isTarget: boolean;
	underline: boolean;
	chevron: boolean;
	// texture width the plate must fit inside; a long word is scaled down to fit
	texW: number;
	kind?: LabelRow["kind"];
	// a just-absorbed completion: "clang" off a shield, "blocked" by armour
	flash?: PlateFlash;
	// 0..1: the newest typed letter is popping (1 = just typed)
	pop?: number;
};

/** A short flash on the front plate after an absorbed completion. */
export type PlateFlash = "none" | "clang" | "blocked";

/** A small heater shield outline, centred on (x, y), `s` tall. */
function shieldIcon(c: Ctx, x: number, y: number, s: number): void {
	const w = s * 0.78;
	c.beginPath();
	c.moveTo(x - w / 2, y - s / 2);
	c.lineTo(x + w / 2, y - s / 2);
	c.lineTo(x + w / 2, y);
	c.quadraticCurveTo(x + w / 2, y + s * 0.32, x, y + s / 2);
	c.quadraticCurveTo(x - w / 2, y + s * 0.32, x - w / 2, y);
	c.closePath();
}

/** A padlock: shackle arc over a body, centred on (x, y), `s` tall. */
function lockIcon(c: Ctx, x: number, y: number, s: number): void {
	const bw = s * 0.72;
	const bh = s * 0.5;
	const by = y - s / 2 + s * 0.46;
	c.beginPath();
	c.arc(x, by, bw * 0.3, Math.PI, 0);
	c.stroke();
	roundRect(c, x - bw / 2, by, bw, bh, s * 0.08);
}

/**
 * Draw one word plate centred at (cx, cy): a rounded plate in the arena plate
 * colour, a thin border (--primary on the target), an optional progress
 * underline and chevron, and the word itself. The typed prefix is the loudest
 * thing on the plate: --primary glyphs with a glow over a --primary wash.
 */
function drawPlate(c: Ctx, cx: number, cy: number, opts: PlateOpts): void {
	const { word, typedCount, plateH, alpha, isTarget, texW } = opts;
	const kind = opts.kind ?? "normal";
	const flash = opts.flash ?? "none";
	let fontPx = opts.fontPx;
	c.font = `bold ${fontPx}px ${LABEL_FONT}`;
	const typed = word.slice(0, typedCount);
	const rest = word.slice(typedCount);
	// shield and armour plates carry an icon to the left of the word
	const hasIcon = kind !== "normal";
	const iconW = () => (hasIcon ? fontPx * 0.95 : 0);
	let typedW = c.measureText(typed).width;
	let totalW = typedW + c.measureText(rest).width;
	let padX = fontPx * 0.45;

	// clamp: a long (tier-4) word would overrun the texture and be clipped, so
	// scale the font down until the whole plate fits (8px margin), then re-measure
	const scale = Math.min(1, (texW - 8) / (totalW + iconW() + padX * 2));
	if (scale < 1) {
		fontPx *= scale;
		c.font = `bold ${fontPx}px ${LABEL_FONT}`;
		typedW = c.measureText(typed).width;
		totalW = typedW + c.measureText(rest).width;
		padX = fontPx * 0.45;
	}

	const plateW = totalW + iconW() + padX * 2;
	const plateX = cx - plateW / 2;
	const plateY = cy - plateH / 2;
	const radius = plateH * (kind === "armoured" ? 0.12 : 0.24);
	roundRect(c, plateX, plateY, plateW, plateH, radius);
	c.globalAlpha = alpha * 0.9;
	c.fillStyle = theme.plate;
	c.fill();
	// absorbed completion: the plate rings (ink) or is refused (--error)
	if (flash !== "none") {
		c.globalAlpha = alpha * 0.35;
		c.fillStyle = flash === "blocked" ? theme.error : theme.ink;
		c.fill();
	}
	const edge =
		flash === "blocked"
			? theme.error
			: flash === "clang"
				? theme.ink
				: isTarget
					? theme.primary
					: theme.ink;
	if (kind === "armoured") {
		// plated: a heavy border with rivets at the corners
		c.globalAlpha = alpha * (flash !== "none" || isTarget ? 1 : 0.7);
		c.lineWidth = 5;
		c.strokeStyle = edge;
		c.stroke();
		c.fillStyle = edge;
		const r = plateH * 0.045;
		const inset = plateH * 0.16;
		for (const [rx, ry] of [
			[plateX + inset, plateY + inset],
			[plateX + plateW - inset, plateY + inset],
			[plateX + inset, plateY + plateH - inset],
			[plateX + plateW - inset, plateY + plateH - inset],
		]) {
			c.beginPath();
			c.arc(rx, ry, r, 0, Math.PI * 2);
			c.fill();
		}
	} else if (kind === "shield") {
		// a shield charge: bracketed ends, like a plate that will come back
		c.globalAlpha = alpha * (flash !== "none" || isTarget ? 1 : 0.6);
		c.lineWidth = isTarget ? 3 : 2;
		c.strokeStyle = edge;
		c.stroke();
		const bw = plateH * 0.12;
		c.lineWidth = 4;
		c.lineCap = "square";
		c.beginPath();
		c.moveTo(plateX + bw * 2, plateY + 6);
		c.lineTo(plateX + 6, plateY + 6);
		c.lineTo(plateX + 6, plateY + plateH - 6);
		c.lineTo(plateX + bw * 2, plateY + plateH - 6);
		c.moveTo(plateX + plateW - bw * 2, plateY + 6);
		c.lineTo(plateX + plateW - 6, plateY + 6);
		c.lineTo(plateX + plateW - 6, plateY + plateH - 6);
		c.lineTo(plateX + plateW - bw * 2, plateY + plateH - 6);
		c.stroke();
	} else {
		c.globalAlpha = alpha * (isTarget || flash !== "none" ? 1 : 0.22);
		c.lineWidth = isTarget ? 3 : 1.5;
		c.strokeStyle = edge;
		c.stroke();
	}

	if (hasIcon) {
		const ix = plateX + padX + iconW() * 0.4;
		const s = fontPx * 0.72;
		c.globalAlpha = alpha * 0.9;
		c.strokeStyle = flash === "blocked" ? theme.error : theme.ink;
		c.fillStyle = flash === "blocked" ? theme.error : theme.ink;
		c.lineWidth = Math.max(2, fontPx * 0.08);
		if (kind === "shield") {
			shieldIcon(c, ix, cy, s);
			c.globalAlpha = alpha * 0.3;
			c.fill();
			c.globalAlpha = alpha * 0.9;
			c.stroke();
		} else {
			lockIcon(c, ix, cy, s);
			c.fill();
		}
	}

	const tx = plateX + padX + iconW();
	const ty = cy + fontPx * 0.36;

	// typed prefix: a --primary wash behind the glyphs
	if (typed) {
		c.globalAlpha = alpha * 0.2;
		c.fillStyle = theme.primary;
		roundRect(
			c,
			tx - fontPx * 0.12,
			plateY + plateH * 0.14,
			typedW + fontPx * 0.24,
			plateH * 0.72,
			radius * 0.6,
		);
		c.fill();
	}

	// progress underline so a half-typed enemy reads at a glance
	if (opts.underline && word.length > 0) {
		const frac = typedCount / word.length;
		c.globalAlpha = alpha;
		c.fillStyle = theme.primary;
		c.fillRect(plateX + 6, plateY + plateH - 7, (plateW - 12) * frac, 4);
	}

	c.textBaseline = "alphabetic";
	c.lineJoin = "round";
	if (rest) {
		c.globalAlpha = alpha * (isTarget ? 1 : 0.86);
		c.fillStyle = theme.ink;
		c.fillText(rest, tx + typedW, ty);
	}
	if (typed) {
		const pop = opts.pop ?? 0;
		c.globalAlpha = alpha;
		c.shadowColor = theme.primary;
		c.shadowBlur = fontPx * 0.35;
		c.fillStyle = theme.primary;
		if (pop > 0) {
			// the newest letter swells and flares, then settles into the prefix
			const head = typed.slice(0, -1);
			const last = typed.slice(-1);
			c.fillText(head, tx, ty);
			const lx = tx + c.measureText(head).width;
			const lw = c.measureText(last).width;
			const s = 1 + 0.45 * pop;
			c.save();
			c.translate(lx + lw / 2, cy);
			c.scale(s, s);
			c.shadowBlur = fontPx * (0.35 + 0.6 * pop);
			// it lands white-hot, then cools into the ember prefix
			c.fillStyle = pop > 0.5 ? theme.ink : theme.primary;
			c.fillText(last, -lw / 2, ty - cy);
			c.restore();
		} else {
			c.fillText(typed, tx, ty);
		}
		c.shadowBlur = 0;
		c.shadowColor = "transparent";
	}

	// chevron above the active target's plate
	if (opts.chevron) {
		const chY = plateY - 12;
		const chW = 16;
		c.beginPath();
		c.moveTo(cx - chW, chY - chW * 0.7);
		c.lineTo(cx, chY);
		c.lineTo(cx + chW, chY - chW * 0.7);
		c.globalAlpha = alpha;
		c.lineWidth = 6;
		c.strokeStyle = theme.primary;
		c.lineCap = "round";
		c.stroke();
	}
	c.globalAlpha = 1;
}

function drawChip(c: Ctx, cx: number, cy: number, label: string): void {
	c.font = `bold 36px ${LABEL_FONT}`;
	const w = c.measureText(label).width + 32;
	roundRect(c, cx - w / 2, cy - 26, w, 52, 14);
	c.globalAlpha = 0.85;
	c.fillStyle = theme.plate;
	c.fill();
	c.globalAlpha = 0.3;
	c.lineWidth = 1.5;
	c.strokeStyle = theme.ink;
	c.stroke();
	c.globalAlpha = 0.8;
	c.textBaseline = "alphabetic";
	c.fillStyle = theme.ink;
	c.fillText(label, cx - (w - 32) / 2, cy + 12);
	c.globalAlpha = 1;
}

/**
 * Single-plate label for powerup pickups (they carry one word, never a chain).
 * The plate is anchored in the BOTTOM 128px row of the texture (headroom above
 * is for the target chevron), so callers can position the plane knowing exactly
 * where the plate sits. Redraws only when the visible content changes.
 */
export function drawLabel(
	v: LabelTarget,
	word: string,
	typedCount: number,
	isTarget: boolean,
): void {
	const text = `${word}:${typedCount}:${isTarget ? 1 : 0}:${fontEpoch}`;
	if (text === v.lastText) return;
	v.lastText = text;
	const { width: W, height: H } = v.texture.getSize();
	const c = v.texture.getContext() as Ctx;
	c.clearRect(0, 0, W, H);
	drawPlate(c, W / 2, H - 64, {
		word,
		typedCount,
		fontPx: isTarget ? FONT_TARGET : FONT_IDLE,
		plateH: isTarget ? PLATE_TARGET : PLATE_IDLE,
		alpha: 1,
		isTarget,
		underline: typedCount > 0,
		chevron: isTarget,
		texW: W,
	});
	v.texture.update();
}

// words shown before collapsing the rest into a "+n" chip. Regular chains fit;
// boss sentences overflow into it.
export const MAX_STACK = 5;

/**
 * Stacked label for enemies: one plate per row of `labelRows`, in typing
 * order, so shield repeats and armour read before they are typed. The front
 * row sits on the bottom plate (nearest the enemy) at full brightness; queued
 * rows stack above it at QUEUE_SCALE/QUEUE_ALPHA; anything beyond MAX_STACK
 * collapses into a "+n" chip at the top. Everything is drawn into ONE fixed
 * tall texture (128px rows) in a single pass, so there is no per-completion
 * texture reallocation. Redraws only when the visible rows, progress, lock or
 * flash change.
 */
export function drawStackedLabel(
	v: LabelTarget,
	rows: readonly LabelRow[],
	isTarget: boolean,
	flash: PlateFlash = "none",
	pop = 0,
): void {
	const visible = Math.min(MAX_STACK, rows.length);
	const overflow = rows.length - visible;
	let shown = "";
	for (let i = 0; i < visible; i++) {
		shown += `${rows[i].kind[0]}${rows[i].word},`;
	}
	const typed = rows[0]?.typed ?? 0;
	const key = `${shown}:${typed}:${isTarget ? 1 : 0}:${overflow}:${flash}:${pop}:${fontEpoch}`;
	if (key === v.lastText) return;
	v.lastText = key;

	const { width: W, height: H } = v.texture.getSize();
	const c = v.texture.getContext() as Ctx;
	c.clearRect(0, 0, W, H);
	const ROW = W / 4; // 128px rows regardless of texture height
	const cx = W / 2;

	for (let i = 0; i < visible; i++) {
		const row = rows[i];
		const cy = H - (i + 0.5) * ROW; // i = 0 → bottom row (nearest the enemy)
		if (i === 0) {
			drawPlate(c, cx, cy, {
				word: row.word,
				typedCount: row.typed,
				fontPx: isTarget ? FONT_TARGET : FONT_IDLE,
				plateH: isTarget ? PLATE_TARGET : PLATE_IDLE,
				alpha: 1,
				isTarget,
				underline: row.typed > 0,
				chevron: isTarget,
				texW: W,
				kind: row.kind,
				flash,
				pop,
			});
		} else {
			// queued rows: smaller + slightly dimmed, no progress (not yet started)
			drawPlate(c, cx, cy, {
				word: row.word,
				typedCount: 0,
				fontPx: FONT_IDLE * QUEUE_SCALE,
				plateH: PLATE_IDLE * QUEUE_SCALE,
				alpha: QUEUE_ALPHA,
				isTarget: false,
				underline: false,
				chevron: false,
				texW: W,
				kind: row.kind,
			});
		}
	}
	if (overflow > 0) {
		drawChip(c, cx, H - (MAX_STACK + 0.5) * ROW, `+${overflow}`);
	}
	v.texture.update();
}
