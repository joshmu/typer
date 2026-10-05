import { describe, expect, it } from "vitest";
import { calculateAccuracy } from "./accuracy";

describe("calculateAccuracy", () => {
	it("returns 100 when every keystroke was correct", () => {
		expect(calculateAccuracy({ correct: 3, incorrect: 0 })).toBe(100);
	});

	it("returns 0 when every keystroke was wrong", () => {
		expect(calculateAccuracy({ correct: 0, incorrect: 2 })).toBe(0);
	});

	it("is correct keystrokes over all character keystrokes", () => {
		expect(calculateAccuracy({ correct: 3, incorrect: 1 })).toBe(75);
	});

	it("counts corrected typos: 10 chars right with 2 fixed mistakes is not 100", () => {
		expect(calculateAccuracy({ correct: 10, incorrect: 2 })).toBe(83);
	});

	it("returns 100 before any keystroke", () => {
		expect(calculateAccuracy({ correct: 0, incorrect: 0 })).toBe(100);
	});

	it("rounds down", () => {
		expect(calculateAccuracy({ correct: 2, incorrect: 1 })).toBe(66);
		expect(calculateAccuracy({ correct: 19, incorrect: 1 })).toBe(95);
	});

	it("is exact on whole percentages, free of float drift", () => {
		expect(calculateAccuracy({ correct: 29, incorrect: 71 })).toBe(29);
		expect(calculateAccuracy({ correct: 57, incorrect: 43 })).toBe(57);
	});

	it("never shows 100 after a mistake", () => {
		expect(calculateAccuracy({ correct: 999, incorrect: 1 })).toBe(99);
		expect(calculateAccuracy({ correct: 99_999, incorrect: 1 })).toBe(99);
	});
});
