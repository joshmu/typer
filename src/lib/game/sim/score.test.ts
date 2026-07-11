import { describe, expect, it } from "vitest";
import { comboMultiplier, killScore } from "./score";

describe("score", () => {
	it("multiplier ramps every 5 combo, capped at 5", () => {
		expect(comboMultiplier(0)).toBe(1);
		expect(comboMultiplier(1)).toBe(1);
		expect(comboMultiplier(5)).toBe(2);
		expect(comboMultiplier(10)).toBe(3);
		expect(comboMultiplier(100)).toBe(5);
	});
	it("kill score scales with word length and combo", () => {
		expect(killScore(4, 1)).toBe(40);
		expect(killScore(4, 5)).toBe(80);
	});
});
