import { describe, expect, it } from "vitest";
import { calculateConsistency } from "./consistency";

describe("calculateConsistency", () => {
	it("returns 100 for perfectly consistent WPM", () => {
		expect(calculateConsistency([50, 50, 50, 50])).toBe(100);
	});

	it("returns lower value for inconsistent WPM", () => {
		const result = calculateConsistency([20, 80, 30, 70]);
		expect(result).toBeLessThan(100);
		expect(result).toBeGreaterThan(0);
	});

	it("returns 100 for single value", () => {
		expect(calculateConsistency([50])).toBe(100);
	});

	it("returns 100 for empty array", () => {
		expect(calculateConsistency([])).toBe(100);
	});

	it("handles all zeros", () => {
		expect(calculateConsistency([0, 0, 0])).toBe(100);
	});
});
