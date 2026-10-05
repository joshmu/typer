import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadAverageWpm, loadBookPercents } from "./book-progress";
import { openBookReader } from "./core/engine/book-reader";
import type { BookProgress, CachedBook } from "./core/types/book";
import { TyperDB, type TypingResult } from "./db";

function makeBook(bookId: string, chapterWords: number[]): CachedBook {
	const chapters = chapterWords.map((count, index) => ({
		index,
		title: `Chapter ${index + 1}`,
		text: Array.from({ length: count }, (_, i) => `w${i}`).join(" "),
		wordCount: count,
	}));
	return {
		bookId,
		meta: {
			id: bookId,
			title: bookId,
			author: "Author",
			description: "",
			language: "en",
			wordCount: 12_345,
			coverUrl: "",
			coverHeroUrl: "",
			chapters: chapters.map((c) => `chapter-${c.index + 1}`),
			datePublished: "",
			dateModified: "",
		},
		chapters,
		cachedAt: 0,
	};
}

function makeProgress(
	book: CachedBook,
	overrides: Partial<BookProgress>,
): BookProgress {
	return {
		bookId: book.bookId,
		chapterIndex: 0,
		wordOffset: 0,
		completedChapters: [],
		totalCharsTyped: 0,
		totalTimeMs: 0,
		averageWpm: 0,
		sessionCount: 1,
		lastAccessedAt: 0,
		startedAt: 0,
		bookMeta: book.meta,
		...overrides,
	};
}

describe("loadBookPercents", () => {
	let db: TyperDB;

	beforeEach(() => {
		db = new TyperDB(`BookPercents_${Date.now()}_${Math.random()}`);
	});

	afterEach(async () => {
		db.close();
		await db.delete();
	});

	it("reports each book's reader percent, not characters typed", async () => {
		const book = makeBook("a/one", [40, 60]);
		const progress = makeProgress(book, {
			chapterIndex: 1,
			wordOffset: 10,
			totalCharsTyped: 90_000,
		});
		await db.cachedBooks.put(book);
		await db.bookProgress.add(progress);

		const percents = await loadBookPercents(db);

		expect(percents["a/one"]).toBe(50);
		expect(percents["a/one"]).toBe(openBookReader(book, progress).percent);
	});

	it("leaves out books whose text is not cached", async () => {
		const book = makeBook("a/two", [10]);
		await db.bookProgress.add(makeProgress(book, { wordOffset: 5 }));

		expect(await loadBookPercents(db)).toEqual({});
	});
});

function result(wpm: number, timestamp: number): TypingResult {
	return {
		mode: "time",
		wpm,
		rawWpm: wpm,
		accuracy: 100,
		consistency: 100,
		duration: 30,
		charCount: 100,
		errorCount: 0,
		timestamp,
		textHash: "",
	};
}

describe("loadAverageWpm", () => {
	let db: TyperDB;

	beforeEach(() => {
		db = new TyperDB(`AverageWpm_${Date.now()}_${Math.random()}`);
	});

	afterEach(async () => {
		db.close();
		await db.delete();
	});

	it("is null with no results", async () => {
		expect(await loadAverageWpm(db)).toBeNull();
	});

	it("averages the most recent results", async () => {
		await db.results.bulkAdd([result(10, 1), result(60, 2), result(80, 3)]);

		expect(await loadAverageWpm(db, 2)).toBe(70);
	});

	it("ignores zero-WPM results", async () => {
		await db.results.bulkAdd([result(0, 1), result(50, 2)]);

		expect(await loadAverageWpm(db)).toBe(50);
	});
});
