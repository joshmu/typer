/**
 * Render-only de-overlap for enemy word labels. Pure: no Babylon or DOM.
 * Boxes are in world units with +y screen-up: `x` is the centre, `bottom`
 * the natural bottom edge (just above the sprite), `height` the whole stack.
 */
export type LabelBox = {
	x: number;
	bottom: number;
	halfW: number;
	height: number;
};

/**
 * Where each label's bottom edge should go: lowest labels keep their place,
 * and a label that would overlap one already placed is lifted just clear of
 * it. Finally every label is held under `safeTop`, the HUD-safe line.
 */
export function layoutLabels(
	boxes: readonly LabelBox[],
	safeTop: number,
): number[] {
	const order = boxes
		.map((_, i) => i)
		.sort((a, b) => boxes[a].bottom - boxes[b].bottom);
	const out = new Array<number>(boxes.length);
	const placed: number[] = [];
	for (const i of order) {
		const b = boxes[i];
		let y = b.bottom;
		let moved = true;
		// lift past every placed label it touches; re-check after each lift
		while (moved) {
			moved = false;
			for (const j of placed) {
				const p = boxes[j];
				const py = out[j];
				const sideBySide = Math.abs(b.x - p.x) >= b.halfW + p.halfW;
				if (sideBySide || y >= py + p.height || py >= y + b.height) continue;
				y = py + p.height;
				moved = true;
			}
		}
		out[i] = y;
		placed.push(i);
	}
	for (let i = 0; i < out.length; i++) {
		out[i] = Math.min(out[i], safeTop - boxes[i].height);
	}
	return out;
}
