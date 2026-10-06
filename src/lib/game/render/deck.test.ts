import { describe, expect, it } from "vitest";
import { DECK_CELL_H, DECK_CELL_W, deckLayout, TERRAIN_CELLS } from "./deck";

describe("deckLayout", () => {
	it("is deterministic for a seed", () => {
		expect(deckLayout(7, 12, 8)).toEqual(deckLayout(7, 12, 8));
	});

	it("fills every slot of the grid from the terrain's cell catalogue", () => {
		const cells = deckLayout(7, 12, 8);
		expect(cells).toHaveLength(96);
		for (const c of cells) {
			expect(TERRAIN_CELLS[c.kind]).toContainEqual(c.src);
			expect(c.x % DECK_CELL_W).toBe(0);
			expect(c.y % DECK_CELL_H).toBe(0);
		}
	});

	it("mixes in some worn cells but never two side by side, across the wrap too", () => {
		const cols = 12;
		const rows = 8;
		const cells = deckLayout(7, cols, rows);
		const at = (x: number, y: number) =>
			cells[((y + rows) % rows) * cols + ((x + cols) % cols)];
		const worn = cells.filter((c) => c.kind === "worn").length;
		expect(worn).toBeGreaterThan(0);
		expect(worn).toBeLessThan(cells.length / 3);
		for (let y = 0; y < rows; y++) {
			for (let x = 0; x < cols; x++) {
				if (at(x, y).kind !== "worn") continue;
				expect(at(x + 1, y).kind).toBe("panel");
				expect(at(x, y + 1).kind).toBe("panel");
			}
		}
	});

	it("only mirrors clean panels, whose edges are symmetric grid lines", () => {
		for (const c of deckLayout(3, 12, 8)) {
			if (c.kind === "worn") {
				expect(c.flipX).toBe(false);
				expect(c.flipY).toBe(false);
			}
		}
	});
});
