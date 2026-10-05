import { describe, expect, it } from "vitest";
import type { CharacterState } from "../types";
import { createCorrectChar, createIncorrectChar } from "../types/test-fixtures";
import { collectPerSecondWPM } from "./snapshots";

const START = 1000;

/** `n` correct chars typed evenly across [fromMs, toMs) after START. */
function correctBetween(n: number, fromMs: number, toMs: number) {
	const step = (toMs - fromMs) / n;
	return Array.from({ length: n }, (_, i) => ({
		...createCorrectChar("a"),
		timestamp: START + fromMs + i * step,
	}));
}

describe("collectPerSecondWPM", () => {
	it("groups correct characters into 1-second buckets", () => {
		const chars = [
			...correctBetween(5, 0, 1000),
			...correctBetween(10, 1000, 2000),
		];
		// 5 chars = 1 word in a second = 60 WPM; 10 chars = 120 WPM
		expect(collectPerSecondWPM(chars, START, 2000)).toEqual([60, 120]);
	});

	it("covers every second of a time test, idle seconds included", () => {
		const chars = correctBetween(45, 0, 9000);
		const samples = collectPerSecondWPM(chars, START, 15_000);
		expect(samples).toHaveLength(15);
		expect(samples.slice(0, 9).every((wpm) => wpm === 60)).toBe(true);
		expect(samples.slice(9)).toEqual([0, 0, 0, 0, 0, 0]);
	});

	it("records an idle second mid-test as zero", () => {
		const chars = [
			...correctBetween(5, 0, 1000),
			...correctBetween(5, 2000, 3000),
		];
		expect(collectPerSecondWPM(chars, START, 3000)).toEqual([60, 0, 60]);
	});

	it("is zero for every second when nothing was typed correctly", () => {
		const chars = [{ ...createIncorrectChar("a", "x"), timestamp: START }];
		expect(collectPerSecondWPM(chars, START, 3000)).toEqual([0, 0, 0]);
	});

	it("folds a short final fraction into the last second at its true rate", () => {
		// 7.3s at a steady 60 WPM: 7 samples, the last spanning 1.3s
		const chars = correctBetween(36, 0, 7300);
		const samples = collectPerSecondWPM(chars, START, 7300);
		expect(samples).toHaveLength(7);
		expect(samples.every((wpm) => Math.abs(wpm - 60) <= 12)).toBe(true);
	});

	it("gives a longer final fraction its own second at its true rate", () => {
		// 7.6s at a steady 60 WPM: 8 samples, the last spanning 0.6s
		const chars = correctBetween(38, 0, 7600);
		const samples = collectPerSecondWPM(chars, START, 7600);
		expect(samples).toHaveLength(8);
		expect(samples.every((wpm) => Math.abs(wpm - 60) <= 12)).toBe(true);
	});

	it("returns no samples for a test with no duration", () => {
		expect(collectPerSecondWPM([], START, 0)).toEqual([]);
	});

	it("ignores incorrect characters", () => {
		const chars: CharacterState[] = [
			{ ...createCorrectChar("a"), timestamp: START + 100 },
			{ ...createIncorrectChar("b", "x"), timestamp: START + 200 },
			{ ...createCorrectChar("c"), timestamp: START + 300 },
		];
		// 2 correct chars / 5 * 60 = 24 WPM
		expect(collectPerSecondWPM(chars, START, 1000)).toEqual([24]);
	});

	it("ignores characters without timestamps", () => {
		const chars: CharacterState[] = [
			{ ...createCorrectChar("a"), timestamp: START + 100 },
			{ ...createCorrectChar("b"), timestamp: null },
		];
		expect(collectPerSecondWPM(chars, START, 1000)).toEqual([12]);
	});
});
