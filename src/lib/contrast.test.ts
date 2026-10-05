import { describe, expect, it } from "vitest";
import { contrastRatio, relativeLuminance } from "./contrast";

describe("contrastRatio", () => {
	it("is 21 for black on white and 1 for a colour on itself", () => {
		expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
		expect(contrastRatio("#1c1a17", "#1c1a17")).toBeCloseTo(1, 5);
	});

	it("is symmetric", () => {
		expect(contrastRatio("#f2873d", "#1c1a17")).toBeCloseTo(
			contrastRatio("#1c1a17", "#f2873d"),
			10,
		);
	});

	it("matches the WCAG reference for mid grey on white", () => {
		expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
	});
});

describe("relativeLuminance", () => {
	it("spans 0 to 1", () => {
		expect(relativeLuminance("#000000")).toBe(0);
		expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 10);
	});
});
