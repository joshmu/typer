import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadBookPercents } from "./book-progress";
import { openBookReader } from "./core/engine/book-reader";
import type { BookProgress, CachedBook } from "./core/types/book";
import { TyperDB } from "./db";

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
