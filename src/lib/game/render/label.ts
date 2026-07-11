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

const AMBER = "#facc15";
const AMBER_BORDER = "rgba(250, 204, 21, 0.85)";
const GREY_BORDER = "rgba(148, 163, 184, 0.4)";
const TARGET_REST = "#ffffff";
const IDLE_REST = "#cbd5e1";
const PLATE_FILL = "rgba(9, 11, 18, 0.92)";
const TEXT_OUTLINE = "rgba(3, 5, 10, 0.95)";

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
};

/**
 * Draw one word plate centred at (cx, cy): a rounded dark fill (alpha 0.92 so a
 * bright emissive enemy behind it can't wash the text out), a thin accent border,
 * an optional amber progress underline, an optional chevron above, and the word
 * itself — typed prefix amber, remainder white/grey — each glyph given a 3px dark
 * `strokeText` outline BEFORE the fill so it stays crisp over any glow.
 */
function drawPlate(c: Ctx, cx: number, cy: number, opts: PlateOpts): void {
	const { word, typedCount, fontPx, plateH, alpha, isTarget } = opts;
	c.globalAlpha = alpha;
	c.font = `bold ${fontPx}px monospace`;
	const typed = word.slice(0, typedCount);
	const rest = word.slice(typedCount);
	const typedW = c.measureText(typed).width;
	const totalW = typedW + c.measureText(rest).width;

	const padX = fontPx * 0.4;
	const plateW = totalW + padX * 2;
	const plateX = cx - plateW / 2;
	const plateY = cy - plateH / 2;
	roundRect(c, plateX, plateY, plateW, plateH, plateH * 0.22);
	c.fillStyle = PLATE_FILL;
	c.fill();
	c.lineWidth = isTarget ? 2.5 : 1;
	c.strokeStyle = isTarget ? AMBER_BORDER : GREY_BORDER;
	c.stroke();

	// thin amber progress underline so a "semi-completed" enemy reads at a glance
	if (opts.underline && word.length > 0) {
		const frac = typedCount / word.length;
		c.fillStyle = "rgba(250, 204, 21, 0.9)";
		c.fillRect(plateX + 5, plateY + plateH - 6, (plateW - 10) * frac, 3);
	}

	// text: dark outline first (stroke), then fill on top
	const tx = cx - totalW / 2;
	const ty = cy + fontPx * 0.34;
	c.textBaseline = "alphabetic";
	c.lineJoin = "round";
	c.lineWidth = 3;
	c.strokeStyle = TEXT_OUTLINE;
	if (typed) c.strokeText(typed, tx, ty);
	if (rest) c.strokeText(rest, tx + typedW, ty);
	c.fillStyle = AMBER;
	if (typed) c.fillText(typed, tx, ty);
	c.fillStyle = isTarget ? TARGET_REST : IDLE_REST;
	if (rest) c.fillText(rest, tx + typedW, ty);

	// subtle chevron above the active target's plate
	if (opts.chevron) {
		const chY = plateY - 10;
		const chW = 16;
		c.beginPath();
		c.moveTo(cx - chW, chY - chW * 0.7);
		c.lineTo(cx, chY);
		c.lineTo(cx + chW, chY - chW * 0.7);
		c.lineWidth = 5;
		c.strokeStyle = "rgba(250, 204, 21, 0.85)";
		c.lineCap = "round";
		c.stroke();
	}
	c.globalAlpha = 1;
}

function drawChip(c: Ctx, cx: number, cy: number, label: string): void {
	c.globalAlpha = 0.55;
	c.font = "bold 30px monospace";
	const w = c.measureText(label).width + 28;
	roundRect(c, cx - w / 2, cy - 22, w, 44, 12);
	c.fillStyle = "rgba(9, 11, 18, 0.9)";
	c.fill();
	c.lineWidth = 1;
	c.strokeStyle = GREY_BORDER;
	c.stroke();
	c.textBaseline = "alphabetic";
	c.fillStyle = IDLE_REST;
	c.fillText(label, cx - (w - 28) / 2, cy + 10);
	c.globalAlpha = 1;
}

/**
 * Single-plate label for powerup pickups (they carry one word, never a chain).
 * Redraws only when the visible content changes, tracked via `v.lastText`.
 */
export function drawLabel(
	v: LabelTarget,
	word: string,
	typedCount: number,
	isTarget: boolean,
): void {
	const text = `${word}:${typedCount}:${isTarget ? 1 : 0}`;
	if (text === v.lastText) return;
	v.lastText = text;
	const { width: W, height: H } = v.texture.getSize();
	const c = v.texture.getContext() as Ctx;
	c.clearRect(0, 0, W, H);
	drawPlate(c, W / 2, H / 2, {
		word,
		typedCount,
		fontPx: isTarget ? 64 : 54,
		plateH: isTarget ? 84 : 72,
		alpha: 1,
		isTarget,
		underline: typedCount > 0,
		chevron: isTarget,
	});
	v.texture.update();
}

const MAX_STACK = 3; // words shown before collapsing the rest into a "+n" chip

/**
 * Stacked word-chain label for enemies. The current word sits on the bottom
 * plate (nearest the enemy) at full brightness; up to two queued words stack
 * above it at 55% scale / 40% alpha; any further words collapse into a "+n" chip
 * at the top. Everything is drawn into ONE fixed tall texture (four 1/4-height
 * rows) in a single pass — the plane height is sized once for the worst case and
 * the unused upper rows stay transparent, so there is no per-completion texture
 * reallocation. Redraws only when the visible slice / progress / lock changes.
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
	const key = `${shown}:${typedCount}:${isTarget ? 1 : 0}:${overflow}`;
	if (key === v.lastText) return;
	v.lastText = key;

	const { width: W, height: H } = v.texture.getSize();
	const c = v.texture.getContext() as Ctx;
	c.clearRect(0, 0, W, H);
	const ROW = H / 4;
	const cx = W / 2;

	for (let i = 0; i < visible; i++) {
		const word = words[wordIndex + i];
		const cy = H - (i + 0.5) * ROW; // i = 0 → bottom row (nearest the enemy)
		if (i === 0) {
			drawPlate(c, cx, cy, {
				word,
				typedCount,
				fontPx: isTarget ? 64 : 54,
				plateH: isTarget ? 84 : 72,
				alpha: 1,
				isTarget,
				underline: typedCount > 0,
				chevron: isTarget,
			});
		} else {
			// queued words: dimmer + smaller, no progress (not yet started)
			drawPlate(c, cx, cy, {
				word,
				typedCount: 0,
				fontPx: 54 * 0.55,
				plateH: 72 * 0.55,
				alpha: 0.4,
				isTarget: false,
				underline: false,
				chevron: false,
			});
		}
	}
	if (overflow > 0) {
		drawChip(c, cx, H - (MAX_STACK + 0.5) * ROW, `+${overflow}`);
	}
	v.texture.update();
}
