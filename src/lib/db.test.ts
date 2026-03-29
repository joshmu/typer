import "fake-indexeddb/auto";
import Dexie, { liveQuery } from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TyperDB, type TypingResult } from "./db";

function createResult(overrides?: Partial<TypingResult>): TypingResult {
	return {
		mode: "custom",
		wpm: 80,
		rawWpm: 90,
		accuracy: 95,
		consistency: 85,
		duration: 30,
		charCount: 400,
		errorCount: 20,
		timestamp: Date.now(),
		textHash: "abc123",
		...overrides,
	};
}

describe("TyperDB", () => {
	let db: TyperDB;

	beforeEach(() => {
		db = new TyperDB(`TestDB_${Date.now()}`);
	});

	afterEach(async () => {
		db.close();
		await db.delete();
	});

	it("adds and retrieves a typing result", async () => {
		const result = createResult({ wpm: 100, accuracy: 98 });
		const id = await db.results.add(result);

		expect(id).toBeGreaterThan(0);

		const retrieved = await db.results.get(id);
		expect(retrieved).toMatchObject({ wpm: 100, accuracy: 98 });
	});

	it("queries results by mode", async () => {
		await db.results.bulkAdd([
			createResult({ mode: "time", wpm: 80 }),
			createResult({ mode: "time", wpm: 120 }),
			createResult({ mode: "words", wpm: 90 }),
		]);

		const timeResults = await db.results.where("mode").equals("time").toArray();

		expect(timeResults).toHaveLength(2);
	});

	it("queries by compound index [mode+wpm]", async () => {
		await db.results.bulkAdd([
			createResult({ mode: "time", wpm: 80 }),
			createResult({ mode: "time", wpm: 120 }),
			createResult({ mode: "words", wpm: 90 }),
		]);

		const fast = await db.results
			.where("[mode+wpm]")
			.between(["time", 100], ["time", Dexie.maxKey])
			.toArray();

		expect(fast).toHaveLength(1);
		expect(fast[0].wpm).toBe(120);
	});

	it("orders results by timestamp", async () => {
		await db.results.bulkAdd([
			createResult({ timestamp: 3000, wpm: 60 }),
			createResult({ timestamp: 1000, wpm: 80 }),
			createResult({ timestamp: 2000, wpm: 100 }),
		]);

		const ordered = await db.results.orderBy("timestamp").toArray();
		expect(ordered.map((r) => r.wpm)).toEqual([80, 100, 60]);
	});

	it("stores and retrieves bookTitle for book mode results", async () => {
		const result = createResult({
			mode: "book",
			bookTitle: "The Great Gatsby",
			wpm: 85,
		});
		const id = await db.results.add(result);
		const retrieved = await db.results.get(id);

		expect(retrieved?.bookTitle).toBe("The Great Gatsby");
		expect(retrieved?.mode).toBe("book");
	});

	it("leaves bookTitle undefined for non-book results", async () => {
		const result = createResult({ mode: "time", wpm: 100 });
		const id = await db.results.add(result);
		const retrieved = await db.results.get(id);

		expect(retrieved?.bookTitle).toBeUndefined();
	});

	it("emits updates via liveQuery", async () => {
		const emissions: TypingResult[][] = [];

		const observable = liveQuery(() => db.results.toArray());
		const subscription = observable.subscribe({
			next: (results) => emissions.push([...results]),
		});

		await new Promise((r) => setTimeout(r, 50));

		await db.results.add(createResult({ wpm: 150 }));

		await new Promise((r) => setTimeout(r, 50));

		subscription.unsubscribe();

		expect(emissions.length).toBeGreaterThanOrEqual(2);
		expect(emissions[0]).toHaveLength(0);
		expect(emissions[emissions.length - 1]).toHaveLength(1);
		expect(emissions[emissions.length - 1][0].wpm).toBe(150);
	});
});
