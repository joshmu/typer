import { describe, expect, it } from "vitest";
import {
	createCharState,
	createCorrectChar,
	createIncorrectChar,
} from "../types/test-fixtures";
import { calculateAccuracy } from "./accuracy";

describe("calculateAccuracy", () => {
	it("returns 100 for all correct characters", () => {
		const chars = [
			createCorrectChar("a"),
			createCorrectChar("b"),
			createCorrectChar("c"),
		];
		expect(calculateAccuracy(chars)).toBe(100);
	});

	it("returns 0 for all incorrect characters", () => {
		const chars = [
			createIncorrectChar("a", "x"),
			createIncorrectChar("b", "y"),
		];
		expect(calculateAccuracy(chars)).toBe(0);
	});

	it("calculates percentage for mixed results", () => {
		const chars = [
			createCorrectChar("a"),
			createCorrectChar("b"),
			createIncorrectChar("c", "x"),
			createCorrectChar("d"),
		];
		// 3 correct out of 4 typed = 75%
		expect(calculateAccuracy(chars)).toBe(75);
	});

	it("returns 100 for no typed characters", () => {
		const chars = [
			createCharState({ expected: "a" }),
			createCharState({ expected: "b" }),
		];
		expect(calculateAccuracy(chars)).toBe(100);
	});

	it("ignores pending characters", () => {
		const chars = [
			createCorrectChar("a"),
			createCharState({ expected: "b" }),
			createCharState({ expected: "c" }),
		];
		// 1 correct out of 1 typed = 100%
		expect(calculateAccuracy(chars)).toBe(100);
	});

	it("rounds to nearest integer", () => {
		const chars = [
			createCorrectChar("a"),
			createCorrectChar("b"),
			createIncorrectChar("c", "x"),
		];
		// 2/3 = 66.67% → 67
		expect(calculateAccuracy(chars)).toBe(67);
	});
});
