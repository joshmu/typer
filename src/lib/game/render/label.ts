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

/**
 * Draw a word label into `v.texture`: the typed prefix in amber, the remainder
 * white when the entity is the locked target else grey; the locked target also
 * renders larger. Redraws only when the visible content (word / progress / lock)
 * changes, tracked via `v.lastText`. Shared verbatim by the enemy and powerup
 * renderers — the visual output MUST stay identical between them.
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
	const ctx = v.texture.getContext();
	ctx.clearRect(0, 0, 256, 64);
	// biome-ignore lint/suspicious/noExplicitAny: ICanvasRenderingContext lacks font metrics typing
	const c = ctx as any;
	c.font = isTarget ? "bold 44px monospace" : "bold 36px monospace";
	const typed = word.slice(0, typedCount);
	const rest = word.slice(typedCount);
	const typedW = c.measureText(typed).width;
	const totalW = typedW + c.measureText(rest).width;
	const x = (256 - totalW) / 2;
	const y = 44;
	c.fillStyle = "#facc15";
	c.fillText(typed, x, y);
	c.fillStyle = isTarget ? "#ffffff" : "#9ca3af";
	c.fillText(rest, x + typedW, y);
	v.texture.update();
}
