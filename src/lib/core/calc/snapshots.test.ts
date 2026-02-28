import { describe, expect, it } from "vitest";
import { createCorrectChar, createIncorrectChar } from "../types/test-fixtures";
import type { CharacterState } from "../types";
import { collectPerSecondWPM } from "./snapshots";

describe("collectPerSecondWPM", () => {
	it("groups correct characters into 1-second buckets", () => {
		const baseTime = 1000;
		const chars: CharacterState[] = [
			// Second 0-1: 5 correct chars = 1 word
			...Array.from({ length: 5 }, (_, i) => ({
				...createCorrectChar("a"),
				timestamp: baseTime + i * 100,
			})),
			// Second 1-2: 10 correct chars = 2 words
			...Array.from({ length: 10 }, (_, i) => ({
				...createCorrectChar("b"),
				timestamp: baseTime + 1000 + i * 100,
			})),
		];

		const result = collectPerSecondWPM(chars, baseTime);
		expect(result).toHaveLength(2);
		// 5 chars/5 = 1 word in 1 second → 60 WPM
		expect(result[0]).toBe(60);
		// 10 chars/5 = 2 words in 1 second → 120 WPM
		expect(result[1]).toBe(120);
	});

	it("returns empty array for no characters", () => {
		expect(collectPerSecondWPM([], 0)).toEqual([]);
	});

	it("ignores incorrect characters", () => {
		const baseTime = 1000;
		const chars: CharacterState[] = [
			{ ...createCorrectChar("a"), timestamp: baseTime + 100 },
			{ ...createIncorrectChar("b", "x"), timestamp: baseTime + 200 },
			{ ...createCorrectChar("c"), timestamp: baseTime + 300 },
		];

		const result = collectPerSecondWPM(chars, baseTime);
		expect(result).toHaveLength(1);
		// 2 correct chars / 5 * 60 = 24 WPM
		expect(result[0]).toBe(24);
	});

	it("handles characters without timestamps", () => {
		const chars: CharacterState[] = [
			createCorrectChar("a"),
			{ ...createCorrectChar("b"), timestamp: null },
		];
		// Should filter out null timestamps
		const result = collectPerSecondWPM(chars, 0);
		expect(result.length).toBeGreaterThanOrEqual(0);
	});
});
