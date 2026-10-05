/**
 * The arena deck: a seamless floor tile assembled from cells of the terrain
 * image. terrain.png is an 8x4 grid of plate cells (grid lines measured below);
 * cutting each cell at its grid-line centres means any two cells meet on a
 * grid line, so the assembled tile repeats with no visible seam. Clean plates
 * fill most of the deck; worn cells (rubble showing through) are sprinkled in
 * and never touch, so no two soil edges meet. Pure: no Babylon or DOM.
 */

/** One cell of the assembled deck, read from the terrain image. */
export type DeckCell = {
	/** destination top-left in deck px */
	x: number;
	y: number;
	/** [row, col] in the terrain image grid */
	src: readonly [number, number];
	kind: "panel" | "worn";
	flipX: boolean;
	flipY: boolean;
};

export const DECK_CELL_W = 172;
export const DECK_CELL_H = 192;

// grid-line centres in terrain.png (1376x768), measured from its dark seams
export const TERRAIN_COLS = [0, 167, 345, 514, 686, 858, 1030, 1205, 1376];
export const TERRAIN_ROWS = [0, 190, 382, 574, 768];

/** [row, col] cells by kind: clean plates, and plates with rubble breaking through. */
export const TERRAIN_CELLS = {
	panel: [
		[0, 3],
		[0, 4],
		[0, 5],
		[0, 7],
		[1, 3],
		[1, 4],
		[2, 2],
		[2, 3],
		[2, 7],
		[3, 2],
	],
	worn: [
		[0, 2],
		[1, 7],
		[2, 0],
		[2, 6],
		[3, 4],
		[3, 5],
	],
} as const satisfies Record<
	DeckCell["kind"],
	readonly (readonly [number, number])[]
>;

const WORN_CHANCE = 0.2;

/** A small seeded LCG: the deck looks the same every run. */
function rng(seed: number): () => number {
	let s = seed >>> 0 || 1;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

/** Lay out a cols x rows deck (row-major). Wraps cleanly when tiled. */
export function deckLayout(
	seed: number,
	cols: number,
	rows: number,
): DeckCell[] {
	const rand = rng(seed);
	const kinds: DeckCell["kind"][] = [];
	const kindAt = (x: number, y: number) =>
		kinds[((y + rows) % rows) * cols + ((x + cols) % cols)];
	for (let y = 0; y < rows; y++) {
		for (let x = 0; x < cols; x++) {
			// neighbours already placed, including the wrap-around ones on the
			// last row and column (the tile repeats)
			const near = [kindAt(x - 1, y), kindAt(x, y - 1)];
			if (x === cols - 1) near.push(kindAt(0, y));
			if (y === rows - 1) near.push(kindAt(x, 0));
			const worn = rand() < WORN_CHANCE && !near.includes("worn");
			kinds.push(worn ? "worn" : "panel");
		}
	}
	return kinds.map((kind, i) => {
		const pool = TERRAIN_CELLS[kind];
		const src = pool[Math.floor(rand() * pool.length)];
		const mirror = kind === "panel";
		return {
			x: (i % cols) * DECK_CELL_W,
			y: Math.floor(i / cols) * DECK_CELL_H,
			src,
			kind,
			flipX: mirror && rand() < 0.5,
			flipY: mirror && rand() < 0.5,
		};
	});
}
