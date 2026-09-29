import { describe, expect, it } from "vitest";
import type { BookChapter, BookProgress, CachedBook } from "../types/book";
import type { TestResult } from "./complete-test";
import {
	applyBookSelection,
	applyResult,
	applyText,
	createInitialSession,
	decideRedo,
	type SessionState,
} from "./session-manager";

function makeChapter(index: number, words: string[]): BookChapter {
	return {
		index,
		title: `Chapter ${index + 1}`,
		text: words.join(" "),
		wordCount: words.length,
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

const RESULT: TestResult = {
	wpm: 1,
	rawWpm: 1,
	accuracy: 100,
	consistency: 100,
	breakdown: { correct: 0, incorrect: 0, missed: 0, extra: 0, total: 0 },
	elapsed: 0,
	wpmPerSecond: [],
};

describe("createInitialSession", () => {
	it("returns null text/result and book defaults for any mode", () => {
		const s = createInitialSession({ type: "custom" });
		expect(s.mode).toEqual({ type: "custom" });
		expect(s.text).toBeNull();
		expect(s.result).toBeNull();
		expect(s.activeBook).toBeNull();
		expect(s.bookReader).toBeNull();
		expect(s.bookFeed).toBeNull();
		expect(s.currentBookProgress).toBeNull();
		expect(s.bookLoading).toBe(false);
	});

	it("preserves the requested mode", () => {
		const s = createInitialSession({
			type: "book",
			bookId: "x",
			chapterIndex: 0,
		});
		expect(s.mode.type).toBe("book");
	});
});

describe("applyText", () => {
	it("sets text and clears the previous result", () => {
		const base: SessionState = {
			...createInitialSession({ type: "custom" }),
			result: { wpm: 50 } as never,
		};
		const next = applyText(base, "hello");
		expect(next.text).toBe("hello");
		expect(next.result).toBeNull();
	});

	it("accepts null to return to the empty state", () => {
		const base = applyText(createInitialSession({ type: "custom" }), "x");
		const next = applyText(base, null);
		expect(next.text).toBeNull();
	});
});

describe("applyBookSelection", () => {
	it("opens a reader at chapter 0 word 0 with no prior progress", () => {
		const book = makeBook([makeChapter(0, ["a", "b", "c", "d", "e"])]);
		const session = applyBookSelection(
			createInitialSession({ type: "book", bookId: "", chapterIndex: 0 }),
			book,
			null,
			3,
		);
		expect(session.activeBook).toBe(book);
		expect(session.bookReader?.position).toEqual({
			chapterIndex: 0,
			wordOffset: 0,
		});
		expect(session.bookFeed?.next(1)).toBe("d");
		expect(session.text).toBe("a b c");
		expect(session.mode).toEqual({
			type: "book",
			bookId: "author/book",
			chapterIndex: 0,
		});
		expect(session.bookLoading).toBe(false);
		expect(session.currentBookProgress).toBeNull();
	});

	it("opens the reader at saved chapter and offset", () => {
		const book = makeBook([
			makeChapter(0, ["a", "b", "c"]),
			makeChapter(1, ["d", "e", "f"]),
		]);
		const prev: BookProgress = {
			bookId: "author/book",
			chapterIndex: 1,
			wordOffset: 1,
			completedChapters: [0],
			totalCharsTyped: 0,
			totalTimeMs: 0,
			averageWpm: 0,
			sessionCount: 0,
			lastAccessedAt: 0,
			startedAt: 0,
			bookMeta: book.meta,
		};
		const session = applyBookSelection(
			createInitialSession({ type: "book", bookId: "", chapterIndex: 0 }),
			book,
			prev,
			3,
		);
		expect(session.text).toBe("e f");
		expect(session.mode).toEqual({
			type: "book",
			bookId: "author/book",
			chapterIndex: 1,
		});
		expect(session.currentBookProgress).toBe(prev);
	});
});

describe("applyResult", () => {
	it("stores the result on the session", () => {
		const session = createInitialSession({ type: "custom" });
		const result = {
			wpm: 80,
			rawWpm: 82,
			accuracy: 99,
			consistency: 90,
			breakdown: {
				correct: 100,
				incorrect: 1,
				missed: 0,
				extra: 0,
				total: 101,
			},
			elapsed: 60_000,
			wpmPerSecond: [],
		};
		const next = applyResult(session, result);
		expect(next.result).toBe(result);
	});

	it("optionally updates the current book progress", () => {
		const session = createInitialSession({
			type: "book",
			bookId: "x",
			chapterIndex: 0,
		});
		const progress = {
			bookId: "x",
			chapterIndex: 0,
			wordOffset: 5,
			completedChapters: [],
			totalCharsTyped: 0,
			totalTimeMs: 0,
			averageWpm: 0,
			sessionCount: 1,
			lastAccessedAt: 0,
			startedAt: 0,
			bookMeta: session.activeBook?.meta as never,
		} as BookProgress;
		const result = {
			wpm: 1,
			rawWpm: 1,
			accuracy: 100,
			consistency: 100,
			breakdown: { correct: 0, incorrect: 0, missed: 0, extra: 0, total: 0 },
			elapsed: 0,
			wpmPerSecond: [],
		};
		const next = applyResult(session, result, progress);
		expect(next.currentBookProgress).toBe(progress);
	});

	it("reopens the reader at the committed progress", () => {
		const book = makeBook([makeChapter(0, ["a", "b", "c", "d", "e"])]);
		const session = applyBookSelection(
			createInitialSession({ type: "book", bookId: "", chapterIndex: 0 }),
			book,
			null,
			3,
		);
		const progress = session.bookReader?.commit(2, {
			charCount: 0,
			elapsedMs: 0,
			wpm: 0,
			now: 0,
		}) as BookProgress;
		const next = applyResult(session, RESULT, progress);
		expect(next.bookReader?.position).toEqual({
			chapterIndex: 0,
			wordOffset: 2,
		});
		expect(next.bookFeed).toBeNull();
	});
});

describe("decideRedo", () => {
	it("custom mode clears text", () => {
		const session = applyText(createInitialSession({ type: "custom" }), "abc");
		const outcome = decideRedo(session, 30);
		expect(outcome.kind).toBe("clear-text");
		expect(outcome.state.text).toBeNull();
		expect(outcome.state.result).toBeNull();
	});

	it("non-book non-custom mode requests refetch", () => {
		const session = applyText(
			createInitialSession({ type: "time", seconds: 30 }),
			"abc",
		);
		const outcome = decideRedo(session, 30);
		expect(outcome.kind).toBe("restart-mode");
		if (outcome.kind === "restart-mode") {
			expect(outcome.mode).toEqual({ type: "time", seconds: 30 });
		}
		expect(outcome.state.result).toBeNull();
	});

	it("book mode continues from the committed position", () => {
		const book = makeBook([makeChapter(0, ["a", "b", "c", "d", "e"])]);
		const selected = applyBookSelection(
			createInitialSession({ type: "book", bookId: "", chapterIndex: 0 }),
			book,
			null,
			3,
		);
		expect(selected.text).toBe("a b c");
		const progress = selected.bookReader?.commit(1, {
			charCount: 0,
			elapsedMs: 0,
			wpm: 0,
			now: 0,
		}) as BookProgress;
		const session = applyResult(selected, RESULT, progress);
		const outcome = decideRedo(session, 2);
		expect(outcome.kind).toBe("book-continue");
		expect(outcome.state.text).toBe("b c");
		expect(outcome.state.bookFeed?.next(1)).toBe("d");
		expect(outcome.state.result).toBeNull();
	});

	it("book mode redo does not advance past uncommitted read-ahead", () => {
		const book = makeBook([makeChapter(0, ["a", "b", "c", "d", "e"])]);
		const session = applyBookSelection(
			createInitialSession({ type: "book", bookId: "", chapterIndex: 0 }),
			book,
			null,
			2,
		);
		session.bookFeed?.next(2);
		expect(decideRedo(session, 2).state.text).toBe("a b");
		expect(decideRedo(session, 2).state.text).toBe("a b");
	});

	it("book mode finished returns to browser", () => {
		const book = makeBook([makeChapter(0, ["a", "b"])]);
		const selected = applyBookSelection(
			createInitialSession({ type: "book", bookId: "", chapterIndex: 0 }),
			book,
			null,
			5,
		);
		const progress = selected.bookReader?.commit(2, {
			charCount: 0,
			elapsedMs: 0,
			wpm: 0,
			now: 0,
		}) as BookProgress;
		const outcome = decideRedo(applyResult(selected, RESULT, progress), 5);
		expect(outcome.kind).toBe("book-finished");
		expect(outcome.state.activeBook).toBeNull();
		expect(outcome.state.bookReader).toBeNull();
		expect(outcome.state.bookFeed).toBeNull();
		expect(outcome.state.text).toBeNull();
	});
});
