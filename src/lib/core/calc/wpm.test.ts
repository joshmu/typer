import { describe, expect, it } from "vitest";
import type { CharacterState } from "../types";
import { createCorrectChar, createIncorrectChar } from "../types/test-fixtures";
import { calculateRawWPM, calculateWPM } from "./wpm";

describe("calculateWPM", () => {
	it("calculates gross WPM: (correct chars / 5) / elapsed minutes", () => {
		// 10 correct chars in 60 seconds = (10/5) / 1 = 2 WPM
		const chars: CharacterState[] = Array.from({ length: 10 }, (_, i) =>
			createCorrectChar(String.fromCharCode(97 + (i % 26))),
		);
		expect(calculateWPM(chars, 60_000)).toBe(2);
	});

	it("returns 0 for zero elapsed time", () => {
		const chars = [createCorrectChar("a")];
		expect(calculateWPM(chars, 0)).toBe(0);
	});

	it("returns 0 for no characters", () => {
		expect(calculateWPM([], 60_000)).toBe(0);
	});

	it("only counts correct characters", () => {
		const chars: CharacterState[] = [
			createCorrectChar("a"),
			createCorrectChar("b"),
			createCorrectChar("c"),
			createCorrectChar("d"),
			createCorrectChar("e"),
			createIncorrectChar("f", "x"),
			createIncorrectChar("g", "y"),
		];
		// 5 correct chars in 60s = (5/5) / 1 = 1 WPM
		expect(calculateWPM(chars, 60_000)).toBe(1);
	});

	it("rounds to nearest integer", () => {
		// 7 correct chars in 60s = (7/5) / 1 = 1.4 → 1
		const chars = Array.from({ length: 7 }, (_, i) =>
			createCorrectChar(String.fromCharCode(97 + i)),
		);
		expect(calculateWPM(chars, 60_000)).toBe(1);
	});
});

describe("calculateRawWPM", () => {
	it("counts every character keystroke, right or wrong", () => {
		// 10 keystrokes in 60s = 10/5 / 1 = 2
		expect(calculateRawWPM({ correct: 7, incorrect: 3 }, 60_000)).toBe(2);
	});

	it("keeps keystrokes that were later backspaced", () => {
		// 25 keystrokes in 30s = 25/5 / 0.5 = 10, whatever is left on screen
		expect(calculateRawWPM({ correct: 20, incorrect: 5 }, 30_000)).toBe(10);
	});

	it("returns 0 for zero elapsed time", () => {
		expect(calculateRawWPM({ correct: 5, incorrect: 0 }, 0)).toBe(0);
	});

	it("returns 0 with no keystrokes", () => {
		expect(calculateRawWPM({ correct: 0, incorrect: 0 }, 60_000)).toBe(0);
	});
});
