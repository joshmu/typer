import type { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";

/**
 * Anything carrying a word-label texture. Both the enemy and powerup renderers
 * share this shape so they can drive the one label-draw path below.
 */
export type LabelTarget = {
	texture: DynamicTexture;
	// last content string drawn, so redraws are skipped when nothing visible changed
	lastText: string;
};

function roundRect(
	// biome-ignore lint/suspicious/noExplicitAny: canvas 2d context, untyped here
	c: any,
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

/**
 * Draw a word label into `v.texture`: a rounded dark plate (with a thin accent
 * border) behind the word so it stays legible over any terrain/nebula, the typed
 * prefix in amber, the remainder white when the entity is the locked target else
 * grey; the locked target renders larger with a brighter border. Redraws only
 * when the visible content (word / progress / lock) changes, tracked via
 * `v.lastText`. Shared verbatim by the enemy and powerup renderers — the visual
 * output MUST stay identical between them.
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
	const ctx = v.texture.getContext();
	ctx.clearRect(0, 0, W, H);
	// biome-ignore lint/suspicious/noExplicitAny: ICanvasRenderingContext lacks font metrics typing
	const c = ctx as any;
	c.font = isTarget ? "bold 48px monospace" : "bold 40px monospace";
	const typed = word.slice(0, typedCount);
	const rest = word.slice(typedCount);
	const typedW = c.measureText(typed).width;
	const totalW = typedW + c.measureText(rest).width;

	// plate sized to fit the text, centred; dark fill + thin accent border
	const padX = 18;
	const plateH = isTarget ? 62 : 54;
	const plateW = Math.min(W - 4, totalW + padX * 2);
	const plateX = (W - plateW) / 2;
	const plateY = (H - plateH) / 2;
	roundRect(c, plateX, plateY, plateW, plateH, 12);
	c.fillStyle = "rgba(9, 11, 18, 0.7)";
	c.fill();
	c.lineWidth = isTarget ? 2 : 1;
	c.strokeStyle = isTarget
		? "rgba(250, 204, 21, 0.85)"
		: "rgba(148, 163, 184, 0.4)";
	c.stroke();

	// text, vertically centred on the plate
	const x = (W - totalW) / 2;
	const y = H / 2 + (isTarget ? 17 : 14);
	c.textBaseline = "alphabetic";
	c.fillStyle = "#facc15";
	c.fillText(typed, x, y);
	c.fillStyle = isTarget ? "#ffffff" : "#cbd5e1";
	c.fillText(rest, x + typedW, y);
	v.texture.update();
}
