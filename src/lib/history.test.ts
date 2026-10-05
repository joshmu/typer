import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { completeTest } from "./core/engine/complete-test";
import type { BookProgress } from "./core/types/book";
import { DatabaseError } from "./core/types/errors";
import { createTypingState } from "./core/types/test-fixtures";
import { TyperDB, type TypingResult } from "./db";
import { recordCompletion, toTypingResult } from "./history";

function makeResult(overrides?: Partial<TypingResult>): TypingResult {
	return {
		mode: "book",
		wpm: 80,
		rawWpm: 90,
		accuracy: 95,
		consistency: 85,
		duration: 30,
		charCount: 400,
		errorCount: 20,
		timestamp: 1_000,
		textHash: "abc123",
		bookTitle: "Test Book",
		...overrides,
	};
}

function makeProgress(
	overrides?: Partial<BookProgress>,
): Omit<BookProgress, "id"> {
	return {
		bookId: "author/book",
		chapterIndex: 0,
		wordOffset: 10,
		completedChapters: [],
		totalCharsTyped: 50,
		totalTimeMs: 10_000,
		averageWpm: 60,
		sessionCount: 1,
		lastAccessedAt: 1_000,
		startedAt: 1_000,
		bookMeta: {
			id: "author/book",
			title: "Test Book",
			author: "Author",
			description: "",
			language: "en",
			wordCount: 100,
			coverUrl: "",
			coverHeroUrl: "",
			chapters: ["chapter-1"],
			datePublished: "",
			dateModified: "",
		},
		...overrides,
	};
}

describe("recordCompletion", () => {
	let db: TyperDB;

	beforeEach(() => {
		db = new TyperDB(`History_${Date.now()}_${Math.random()}`);
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		db.close();
		await db.delete();
	});

	it("records the result alone when there is no book progress", async () => {
		await recordCompletion(makeResult({ mode: "time" }), undefined, db);

		expect(await db.results.toArray()).toMatchObject([{ mode: "time" }]);
		expect(await db.bookProgress.count()).toBe(0);
	});

	it("records the result and inserts new book progress", async () => {
		await recordCompletion(makeResult(), makeProgress(), db);

		expect(await db.results.count()).toBe(1);
		expect(await db.bookProgress.toArray()).toMatchObject([
			{ bookId: "author/book", wordOffset: 10 },
		]);
	});

	it("updates existing progress for the same book instead of adding another", async () => {
		await recordCompletion(makeResult(), makeProgress(), db);
		await recordCompletion(
			makeResult(),
			makeProgress({ wordOffset: 25, sessionCount: 2 }),
			db,
		);

		expect(await db.results.count()).toBe(2);
		expect(await db.bookProgress.toArray()).toMatchObject([
			{ bookId: "author/book", wordOffset: 25, sessionCount: 2 },
		]);
	});

	it("writes nothing and rejects with a DatabaseError when the progress write fails", async () => {
		vi.spyOn(db.bookProgress, "put").mockImplementation(() => {
			throw new Error("disk full");
		});

		await expect(
			recordCompletion(makeResult(), makeProgress(), db),
		).rejects.toBeInstanceOf(DatabaseError);
		expect(await db.results.count()).toBe(0);
		expect(await db.bookProgress.count()).toBe(0);
	});
});

describe("toTypingResult", () => {
	it("builds the stored record from a completed test", () => {
		const state = createTypingState("the quick", {
			startTime: 1_000,
			endTime: 31_500,
		});
		const completed = completeTest(state);

		const record = toTypingResult(state, completed, undefined, 42);

		expect(record).toEqual({
			mode: state.mode.type,
			wpm: completed.result.wpm,
			rawWpm: completed.result.rawWpm,
			accuracy: completed.result.accuracy,
			consistency: completed.result.consistency,
			duration: 30,
			charCount: completed.charCount,
			errorCount: completed.errorCount,
			timestamp: 42,
			textHash: expect.any(String),
			bookTitle: undefined,
		});
	});

	it("keeps the book title only in book mode", () => {
		const state = createTypingState("the quick", {
			mode: { type: "book", bookId: "author/book", chapterIndex: 0 },
		});
		const completed = completeTest(state);

		expect(toTypingResult(state, completed, "Test Book", 0).bookTitle).toBe(
			"Test Book",
		);
		state.mode = { type: "time", seconds: 30 };
		expect(
			toTypingResult(state, completed, "Test Book", 0).bookTitle,
		).toBeUndefined();
	});

	it("flags a time test left running with no input as AFK", () => {
		const state = createTypingState("the quick", {
			mode: { type: "time", seconds: 15 },
			startTime: 1_000,
			endTime: 16_000,
		});
		const completed = completeTest(state);

		expect(toTypingResult(state, completed, undefined, 0).afk).toBe(true);
	});

	it("leaves the AFK flag off a test typed to the end", () => {
		const state = createTypingState("the quick", {
			startTime: 1_000,
			endTime: 31_500,
		});
		const record = toTypingResult(state, completeTest(state), undefined, 0);

		expect(record).not.toHaveProperty("afk");
	});
});
