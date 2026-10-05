import type { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";

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
const FONT_TARGET = 80;
const PLATE_TARGET = 104;
const PLATE_IDLE = 88;
// queued words: smaller and dimmer than the current word, still readable
const QUEUE_SCALE = 0.8;
const QUEUE_ALPHA = 0.8;

// the app's typing face; canvas text falls back to monospace until it loads
const LABEL_FONT = '"Roboto Mono", ui-monospace, monospace';

/** Theme colours the plates draw with (see refreshLabelTheme). */
type LabelTheme = { plate: string; ink: string; primary: string };
let theme: LabelTheme = {
	plate: "#101218",
	ink: "#e6e6e6",
	primary: "#e2b714",
};

/**
 * Read the plate palette from the live theme: --primary for typed progress,
 * and the theme's bg/text pair arranged dark-plate/light-ink (the arena is
 * always dark). Call once per run; themes don't change mid-run.
 */
export function refreshLabelTheme(
	read: (name: string) => string,
	arrange: (bg: string, text: string) => { plate: string; ink: string },
): void {
	const primary = read("--primary").trim() || theme.primary;
	theme = { ...arrange(read("--bg"), read("--text")), primary };
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
};

/**
 * Draw one word plate centred at (cx, cy): a rounded plate in the arena plate
 * colour, a thin border (--primary on the target), an optional progress
 * underline and chevron, and the word itself. The typed prefix is the loudest
 * thing on the plate: --primary glyphs with a glow over a --primary wash.
 */
function drawPlate(c: Ctx, cx: number, cy: number, opts: PlateOpts): void {
	const { word, typedCount, plateH, alpha, isTarget, texW } = opts;
	let fontPx = opts.fontPx;
	c.font = `bold ${fontPx}px ${LABEL_FONT}`;
	const typed = word.slice(0, typedCount);
	const rest = word.slice(typedCount);
	let typedW = c.measureText(typed).width;
	let totalW = typedW + c.measureText(rest).width;
	let padX = fontPx * 0.45;

	// clamp: a long (tier-4) word would overrun the texture and be clipped, so
	// scale the font down until the whole plate fits (8px margin), then re-measure
	const scale = Math.min(1, (texW - 8) / (totalW + padX * 2));
	if (scale < 1) {
		fontPx *= scale;
		c.font = `bold ${fontPx}px ${LABEL_FONT}`;
		typedW = c.measureText(typed).width;
		totalW = typedW + c.measureText(rest).width;
		padX = fontPx * 0.45;
	}

	const plateW = totalW + padX * 2;
	const plateX = cx - plateW / 2;
	const plateY = cy - plateH / 2;
	const radius = plateH * 0.24;
	roundRect(c, plateX, plateY, plateW, plateH, radius);
	c.globalAlpha = alpha * 0.9;
	c.fillStyle = theme.plate;
	c.fill();
	c.globalAlpha = alpha * (isTarget ? 1 : 0.22);
	c.lineWidth = isTarget ? 3 : 1.5;
	c.strokeStyle = isTarget ? theme.primary : theme.ink;
	c.stroke();

	const tx = cx - totalW / 2;
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
		c.globalAlpha = alpha;
		c.shadowColor = theme.primary;
		c.shadowBlur = fontPx * 0.35;
		c.fillStyle = theme.primary;
		c.fillText(typed, tx, ty);
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
const MAX_STACK = 5;

/**
 * Stacked word-chain label for enemies. The current word sits on the bottom
 * plate (nearest the enemy) at full brightness; queued words stack above it at
 * QUEUE_SCALE/QUEUE_ALPHA; anything beyond MAX_STACK collapses into a "+n"
 * chip at the top. Everything is drawn into ONE fixed tall texture (128px
 * rows) in a single pass — the plane height is sized once for the worst case
 * and unused upper rows stay transparent, so there is no per-completion
 * texture reallocation. Redraws only when the visible slice / progress / lock
 * changes.
 */
export function drawStackedLabel(
	v: LabelTarget,
	words: string[],
	wordIndex: number,
	typedCount: number,
	isTarget: boolean,
): void {
	const remaining = words.length - wordIndex;
	const visible = Math.min(MAX_STACK, remaining);
	const overflow = remaining - visible;
	const shown = words.slice(wordIndex, wordIndex + visible).join(",");
	const key = `${shown}:${typedCount}:${isTarget ? 1 : 0}:${overflow}:${fontEpoch}`;
	if (key === v.lastText) return;
	v.lastText = key;

	const { width: W, height: H } = v.texture.getSize();
	const c = v.texture.getContext() as Ctx;
	c.clearRect(0, 0, W, H);
	const ROW = W / 4; // 128px rows regardless of texture height
	const cx = W / 2;

	for (let i = 0; i < visible; i++) {
		const word = words[wordIndex + i];
		const cy = H - (i + 0.5) * ROW; // i = 0 → bottom row (nearest the enemy)
		if (i === 0) {
			drawPlate(c, cx, cy, {
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
		} else {
			// queued words: smaller + slightly dimmed, no progress (not yet started)
			drawPlate(c, cx, cy, {
				word,
				typedCount: 0,
				fontPx: FONT_IDLE * QUEUE_SCALE,
				plateH: PLATE_IDLE * QUEUE_SCALE,
				alpha: QUEUE_ALPHA,
				isTarget: false,
				underline: false,
				chevron: false,
				texW: W,
			});
		}
	}
	if (overflow > 0) {
		drawChip(c, cx, H - (MAX_STACK + 0.5) * ROW, `+${overflow}`);
	}
	v.texture.update();
}
