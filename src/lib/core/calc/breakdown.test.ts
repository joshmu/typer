import { describe, expect, it } from "vitest";
import {
	createCharState,
	createCorrectChar,
	createIncorrectChar,
} from "../types/test-fixtures";
import { calculateCharBreakdown } from "./breakdown";

describe("calculateCharBreakdown", () => {
	it("counts correct, incorrect, and missed characters", () => {
		const chars = [
			createCorrectChar("a"),
			createCorrectChar("b"),
			createIncorrectChar("c", "x"),
			createCharState({ expected: "d" }),
		];

		const result = calculateCharBreakdown(chars);
		expect(result.correct).toBe(2);
		expect(result.incorrect).toBe(1);
		expect(result.missed).toBe(1);
		expect(result.extra).toBe(0);
		expect(result.total).toBe(4);
	});

	it("handles all correct", () => {
		const chars = [createCorrectChar("a"), createCorrectChar("b")];
		const result = calculateCharBreakdown(chars);
		expect(result.correct).toBe(2);
		expect(result.incorrect).toBe(0);
		expect(result.missed).toBe(0);
		expect(result.total).toBe(2);
	});

	it("handles empty array", () => {
		const result = calculateCharBreakdown([]);
		expect(result.correct).toBe(0);
		expect(result.incorrect).toBe(0);
		expect(result.missed).toBe(0);
		expect(result.extra).toBe(0);
		expect(result.total).toBe(0);
	});

	it("counts extra characters", () => {
		const chars = [
			createCharState({ expected: "a", typed: "a", status: "correct" }),
			createCharState({ expected: "", typed: "x", status: "extra" }),
		];
		const result = calculateCharBreakdown(chars);
		expect(result.correct).toBe(1);
		expect(result.extra).toBe(1);
		expect(result.total).toBe(2);
	});
});
