import { describe, expect, it } from "vitest";
import { lineScrollOffset } from "./line-scroll";

// Inline spans report offsetTop below the line box top, so line tops are
// offset by a constant (8px here) from multiples of the line height.
const LH = 48;
const FIRST = 8;

describe("lineScrollOffset", () => {
	it("does not scroll on the first two lines", () => {
		expect(lineScrollOffset(FIRST, FIRST, LH, 0)).toBe(0);
		expect(lineScrollOffset(FIRST + LH, FIRST, LH, 0)).toBe(0);
	});

	it("scrolls exactly one line height when the third line becomes active", () => {
		expect(lineScrollOffset(FIRST + 2 * LH, FIRST, LH, 0)).toBe(LH);
	});

	it("keeps scrolling in whole lines", () => {
		expect(lineScrollOffset(FIRST + 5 * LH, FIRST, LH, 3 * LH)).toBe(4 * LH);
	});

	it("snaps sub-pixel tops to the nearest line", () => {
		expect(lineScrollOffset(FIRST + 2 * LH + 0.4, FIRST, LH, 0)).toBe(LH);
	});

	it("never scrolls back up", () => {
		expect(lineScrollOffset(FIRST + LH, FIRST, LH, 2 * LH)).toBe(2 * LH);
	});
});
