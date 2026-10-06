import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TyperDB, type TypingResult } from "./db";
import { findPreviousBest } from "./queries";

function result(overrides: Partial<TypingResult>): TypingResult {
	return {
		mode: "time",
		wpm: 80,
		rawWpm: 85,
		accuracy: 95,
		consistency: 80,
		duration: 30,
		charCount: 200,
		errorCount: 2,
		timestamp: 100,
		textHash: "h",
		...overrides,
	};
}

describe("findPreviousBest", () => {
	let db: TyperDB;

	beforeEach(() => {
		db = new TyperDB(`Queries_${Date.now()}_${Math.random()}`);
	});

	afterEach(async () => {
		db.close();
		await db.delete();
	});

	it("finds the best earlier result in the same mode", async () => {
		await db.results.bulkAdd([
			result({ wpm: 70, timestamp: 1 }),
			result({ wpm: 90, timestamp: 2 }),
			result({ wpm: 120, mode: "words", timestamp: 3 }),
		]);
		expect(await findPreviousBest({ mode: "time", before: 10 }, db)).toBe(90);
	});

	it("ignores the result being compared and anything after it", async () => {
		await db.results.bulkAdd([
			result({ wpm: 70, timestamp: 1 }),
			result({ wpm: 95, timestamp: 10 }),
		]);
		expect(await findPreviousBest({ mode: "time", before: 10 }, db)).toBe(70);
	});

	it("leaves AFK results out", async () => {
		await db.results.bulkAdd([
			result({ wpm: 70, timestamp: 1 }),
			result({ wpm: 140, timestamp: 2, afk: true }),
		]);
		expect(await findPreviousBest({ mode: "time", before: 10 }, db)).toBe(70);
	});

	it("compares time tests of the same length only", async () => {
		await db.results.bulkAdd([
			result({ wpm: 110, duration: 15, timestamp: 1 }),
			result({ wpm: 75, duration: 60, timestamp: 2 }),
		]);
		expect(
			await findPreviousBest({ mode: "time", duration: 60, before: 10 }, db),
		).toBe(75);
	});

	it("is null with no earlier result", async () => {
		expect(await findPreviousBest({ mode: "time", before: 10 }, db)).toBeNull();
	});

	it("compares words tests of the same count only", async () => {
		await db.results.bulkAdd([
			result({ mode: "words", wpm: 130, option: "10", timestamp: 1 }),
			result({ mode: "words", wpm: 90, option: "50", timestamp: 2 }),
			result({ mode: "words", wpm: 140, timestamp: 3 }),
		]);
		expect(
			await findPreviousBest({ mode: "words", option: "50", before: 10 }, db),
		).toBe(90);
	});
});
