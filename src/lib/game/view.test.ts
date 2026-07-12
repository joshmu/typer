import { describe, expect, it } from "vitest";
import { ORTHO_HALF, vignetteGradient } from "./view";

describe("vignetteGradient", () => {
	it("returns none for an unmeasured shell", () => {
		expect(vignetteGradient(0)).toBe("none");
		expect(vignetteGradient(Number.NaN)).toBe("none");
		expect(vignetteGradient(-10)).toBe("none");
	});

	it("builds a radial gradient with ordered pixel stops", () => {
		const g = vignetteGradient(760);
		expect(g).toContain("radial-gradient(circle at center");
		const stops = [...g.matchAll(/(\d+)px/g)].map((m) => Number(m[1]));
		expect(stops).toHaveLength(3);
		expect(stops[0]).toBeLessThan(stops[1]);
		expect(stops[1]).toBeLessThan(stops[2]);
	});

	it("scales stops linearly with canvas height", () => {
		const stops = (h: number) =>
			[...vignetteGradient(h).matchAll(/(\d+)px/g)].map((m) => Number(m[1]));
		const small = stops(380);
		const large = stops(760);
		for (let i = 0; i < 3; i++) {
			expect(large[i]).toBeCloseTo(small[i] * 2, 0);
		}
	});

	it("keeps the darkness inside the frame's half-height in world units", () => {
		// the darkest stop must sit below ORTHO_HALF so the gradient is visible
		const g = vignetteGradient(2 * ORTHO_HALF); // 1px per world unit
		const stops = [...g.matchAll(/(\d+)px/g)].map((m) => Number(m[1]));
		expect(stops[2]).toBeLessThan(ORTHO_HALF);
	});
});
