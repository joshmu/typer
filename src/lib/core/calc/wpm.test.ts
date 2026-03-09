import { describe, expect, it } from "vitest";
import type { CharacterState } from "../types";
import {
	createCharState,
	createCorrectChar,
	createIncorrectChar,
} from "../types/test-fixtures";
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
	it("counts all typed chars (correct + incorrect + extra)", () => {
		// 5 correct + 2 incorrect + 1 extra = 8 typed chars in 60s
		// Math.round(8/5/1) = 2
		const chars: CharacterState[] = [
			...Array.from({ length: 5 }, (_, i) =>
				createCorrectChar(String.fromCharCode(97 + i)),
			),
			createIncorrectChar("f", "x"),
			createIncorrectChar("g", "y"),
			createCharState({ expected: "", typed: "x", status: "extra" }),
		];
		expect(calculateRawWPM(chars, 60_000)).toBe(2);
	});

	it("excludes pending and missed chars", () => {
		const chars: CharacterState[] = [
			createCorrectChar("a"),
			createCorrectChar("b"),
			createCorrectChar("c"),
			createCorrectChar("d"),
			createCorrectChar("e"),
			createIncorrectChar("f", "x"),
			createCharState({ expected: "", typed: "z", status: "extra" }),
			createCharState({ expected: "g", status: "pending" }),
			createCharState({ expected: "h", status: "missed" }),
		];
		// 5 correct + 1 incorrect + 1 extra = 7 typed, pending/missed excluded
		// Math.round(7/5/1) = 1
		expect(calculateRawWPM(chars, 60_000)).toBe(1);
	});

	it("returns 0 for zero elapsed time", () => {
		const chars = [createCorrectChar("a")];
		expect(calculateRawWPM(chars, 0)).toBe(0);
	});

	it("returns 0 for empty array", () => {
		expect(calculateRawWPM([], 60_000)).toBe(0);
	});
});
