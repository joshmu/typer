import { describe, expect, it } from "vitest";
import type { BookChapter, BookProgress, CachedBook } from "../types/book";
import { createTypingState } from "../types/test-fixtures";
import {
	type CommitStats,
	countCompletedWords,
	openBookReader,
} from "./book-reader";
import { processKeystroke } from "./process-keystroke";

function makeChapter(index: number, wordCount: number): BookChapter {
	const words = Array.from({ length: wordCount }, (_, i) => `c${index}w${i}`);
	return {
		index,
		title: `Chapter ${index + 1}`,
		text: words.join(" "),
		wordCount,
	};
}

function makeBook(chapters: BookChapter[]): CachedBook {
	return {
		bookId: "author/book",
		meta: {
			id: "author/book",
			title: "Test Book",
			author: "Author",
			description: "",
			language: "en",
			wordCount: chapters.reduce((s, c) => s + c.wordCount, 0),
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
	overrides: Partial<BookProgress> = {},
): BookProgress {
	return {
		bookId: book.bookId,
		chapterIndex: 0,
		wordOffset: 0,
		completedChapters: [],
		totalCharsTyped: 0,
		totalTimeMs: 0,
		averageWpm: 0,
		sessionCount: 0,
		lastAccessedAt: 0,
		startedAt: 0,
		bookMeta: book.meta,
		...overrides,
	};
}

const STATS: CommitStats = { charCount: 0, elapsedMs: 0, wpm: 0, now: 1 };

describe("countCompletedWords", () => {
	it("returns 0 when no words have been typed", () => {
		expect(countCompletedWords(createTypingState("hello world"))).toBe(0);
	});

	it("counts words the cursor has moved past", () => {
		let state = createTypingState("ab cd ef");
		for (const key of ["a", "b", " ", "c", "d", " ", "e"]) {
			state = processKeystroke(state, key, 1000);
		}
		expect(countCompletedWords(state)).toBe(2);
	});

	it("counts the last word once it is typed", () => {
		let state = createTypingState("ab cd");
		for (const key of ["a", "b", " ", "c", "d"]) {
			state = processKeystroke(state, key, 1000);
		}
		expect(countCompletedWords(state)).toBe(2);
	});

	it("finishes the book when a session types its last word", () => {
		const book = makeBook([makeChapter(0, 3), makeChapter(1, 2)]);
		const reader = openBookReader(book, null);
		const text = reader.cursor().next(50);
		let state = createTypingState(text);
		for (const key of text) state = processKeystroke(state, key, 1000);

		const next = reader.commit(countCompletedWords(state), STATS);
		const reopened = openBookReader(book, next as BookProgress);
		expect(reopened.finished).toBe(true);
		expect(reopened.percent).toBe(100);
	});
});

describe("openBookReader", () => {
	it("starts at the beginning with no progress", () => {
		const reader = openBookReader(makeBook([makeChapter(0, 10)]), null);
		expect(reader.position).toEqual({ chapterIndex: 0, wordOffset: 0 });
		expect(reader.percent).toBe(0);
		expect(reader.chapterTitle).toBe("Chapter 1");
		expect(reader.finished).toBe(false);
	});

	it("opens at the saved position", () => {
		const book = makeBook([makeChapter(0, 10), makeChapter(1, 10)]);
		const reader = openBookReader(
			book,
			makeProgress(book, { chapterIndex: 1, wordOffset: 5 }),
		);
		expect(reader.position).toEqual({ chapterIndex: 1, wordOffset: 5 });
		expect(reader.chapterTitle).toBe("Chapter 2");
		expect(reader.cursor().next(2)).toBe("c1w5 c1w6");
	});

	it("clamps a drifted word offset to the end of its chapter", () => {
		const book = makeBook([makeChapter(0, 10), makeChapter(1, 10)]);
		const reader = openBookReader(
			book,
			makeProgress(book, { chapterIndex: 0, wordOffset: 45 }),
		);
		expect(reader.position).toEqual({ chapterIndex: 0, wordOffset: 10 });
		expect(reader.percent).toBe(50);
		expect(reader.cursor().next(1)).toBe("c1w0");
	});

	it("clamps a chapter index past the end to the end of the book", () => {
		const book = makeBook([makeChapter(0, 10), makeChapter(1, 10)]);
		const reader = openBookReader(
			book,
			makeProgress(book, { chapterIndex: 7, wordOffset: 3 }),
		);
		expect(reader.position).toEqual({ chapterIndex: 1, wordOffset: 10 });
		expect(reader.percent).toBe(100);
		expect(reader.finished).toBe(true);
	});
});

describe("BookReader.percent", () => {
	it("is committed word offset over total words", () => {
		const book = makeBook([makeChapter(0, 30), makeChapter(1, 70)]);
		const reader = openBookReader(
			book,
			makeProgress(book, { chapterIndex: 1, wordOffset: 20 }),
		);
		expect(reader.percent).toBe(50);
	});

	it("ignores characters typed", () => {
		const book = makeBook([makeChapter(0, 100)]);
		const reader = openBookReader(
			book,
			makeProgress(book, { wordOffset: 10, totalCharsTyped: 99_999 }),
		);
		expect(reader.percent).toBe(10);
	});

	it("only reaches 100 when the book is finished", () => {
		const book = makeBook([makeChapter(0, 1000)]);
		const reader = openBookReader(
			book,
			makeProgress(book, { wordOffset: 999 }),
		);
		expect(reader.percent).toBe(99);
	});

	it("is 0 for a book with no words", () => {
		const book = makeBook([makeChapter(0, 0)]);
		expect(openBookReader(book, null).percent).toBe(0);
	});
});

describe("BookReader.cursor", () => {
	it("reads ahead without moving the committed position", () => {
		const book = makeBook([makeChapter(0, 100)]);
		const reader = openBookReader(book, null);
		const cursor = reader.cursor();
		expect(cursor.next(3)).toBe("c0w0 c0w1 c0w2");
		expect(cursor.next(2)).toBe("c0w3 c0w4");
		expect(reader.position).toEqual({ chapterIndex: 0, wordOffset: 0 });
		expect(reader.cursor().next(1)).toBe("c0w0");
	});

	it("crosses chapters and reports exhaustion", () => {
		const book = makeBook([makeChapter(0, 2), makeChapter(1, 1)]);
		const cursor = openBookReader(book, null).cursor();
		expect(cursor.exhausted).toBe(false);
		expect(cursor.next(5)).toBe("c0w0 c0w1 c1w0");
		expect(cursor.exhausted).toBe(true);
		expect(cursor.next(5)).toBe("");
	});
});

describe("BookReader.commit", () => {
	it("advances from the committed position by the words typed", () => {
		const book = makeBook([makeChapter(0, 100)]);
		const reader = openBookReader(book, makeProgress(book, { wordOffset: 25 }));
		reader.cursor().next(60);
		const next = reader.commit(10, STATS);
		expect(next).toMatchObject({ chapterIndex: 0, wordOffset: 35 });
	});

	it("keeps the position when nothing was typed", () => {
		const book = makeBook([makeChapter(0, 100)]);
		const reader = openBookReader(book, makeProgress(book, { wordOffset: 50 }));
		expect(reader.commit(0, STATS)).toMatchObject({
			chapterIndex: 0,
			wordOffset: 50,
		});
	});

	it("crosses chapter boundaries and records completed chapters", () => {
		const book = makeBook([
			makeChapter(0, 5),
			makeChapter(1, 5),
			makeChapter(2, 100),
		]);
		const next = openBookReader(book, null).commit(12, STATS);
		expect(next.chapterIndex).toBe(2);
		expect(next.wordOffset).toBe(2);
		expect(next.completedChapters).toEqual([0, 1]);
	});

	it("stays at the end of a chapter typed exactly to its last word", () => {
		const book = makeBook([makeChapter(0, 10), makeChapter(1, 100)]);
		const next = openBookReader(book, null).commit(10, STATS);
		expect(next).toMatchObject({ chapterIndex: 0, wordOffset: 10 });
		expect(
			openBookReader(book, next as BookProgress)
				.cursor()
				.next(1),
		).toBe("c1w0");
	});

	it("does not duplicate already-completed chapters", () => {
		const book = makeBook([
			makeChapter(0, 5),
			makeChapter(1, 5),
			makeChapter(2, 100),
		]);
		const reader = openBookReader(
			book,
			makeProgress(book, { chapterIndex: 1, completedChapters: [0] }),
		);
		const next = reader.commit(7, STATS);
		expect(next.chapterIndex).toBe(2);
		expect(next.completedChapters).toEqual([0, 1]);
	});

	it("creates fresh progress when there is none", () => {
		const book = makeBook([makeChapter(0, 100)]);
		const next = openBookReader(book, null).commit(3, {
			charCount: 15,
			elapsedMs: 60_000,
			wpm: 30,
			now: 5_000_000,
		});
		expect(next).toEqual({
			bookId: "author/book",
			chapterIndex: 0,
			wordOffset: 3,
			completedChapters: [],
			totalCharsTyped: 15,
			totalTimeMs: 60_000,
			averageWpm: 30,
			sessionCount: 1,
			lastAccessedAt: 5_000_000,
			startedAt: 5_000_000,
			bookMeta: book.meta,
		});
	});

	it("accumulates stats onto the previous progress", () => {
		const book = makeBook([makeChapter(0, 100)]);
		const reader = openBookReader(
			book,
			makeProgress(book, {
				wordOffset: 10,
				totalCharsTyped: 50,
				totalTimeMs: 60_000,
				averageWpm: 40,
				sessionCount: 2,
				lastAccessedAt: 1_000,
				startedAt: 500,
			}),
		);
		const next = reader.commit(4, {
			charCount: 20,
			elapsedMs: 30_000,
			wpm: 70,
			now: 10_000,
		});
		expect(next.wordOffset).toBe(14);
		expect(next.totalCharsTyped).toBe(70);
		expect(next.totalTimeMs).toBe(90_000);
		// (40 * 2 + 70) / 3
		expect(next.averageWpm).toBe(50);
		expect(next.sessionCount).toBe(3);
		expect(next.startedAt).toBe(500);
		expect(next.lastAccessedAt).toBe(10_000);
	});
});
