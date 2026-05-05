import { describe, expect, it } from "vitest";
import type { BookChapter, BookProgress, CachedBook } from "../types/book";
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

describe("createInitialSession", () => {
	it("returns null text/result and book defaults for any mode", () => {
		const s = createInitialSession({ type: "custom" });
		expect(s.mode).toEqual({ type: "custom" });
		expect(s.text).toBeNull();
		expect(s.result).toBeNull();
		expect(s.activeBook).toBeNull();
		expect(s.bookFeeder).toBeNull();
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
	it("seeds feeder at chapter 0 word 0 with no prior progress", () => {
		const book = makeBook([makeChapter(0, ["a", "b", "c", "d", "e"])]);
		const session = applyBookSelection(
			createInitialSession({ type: "book", bookId: "", chapterIndex: 0 }),
			book,
			null,
			3,
		);
		expect(session.activeBook).toBe(book);
		expect(session.bookFeeder).not.toBeNull();
		expect(session.text).toBe("a b c");
		expect(session.mode).toEqual({
			type: "book",
			bookId: "author/book",
			chapterIndex: 0,
		});
		expect(session.bookLoading).toBe(false);
		expect(session.currentBookProgress).toBeNull();
	});

	it("resumes feeder at saved chapter and offset", () => {
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

	it("book mode with words remaining continues feeder", () => {
		const book = makeBook([makeChapter(0, ["a", "b", "c", "d", "e"])]);
		const session = applyBookSelection(
			createInitialSession({ type: "book", bookId: "", chapterIndex: 0 }),
			book,
			null,
			2,
		);
		expect(session.text).toBe("a b");
		const outcome = decideRedo(session, 2);
		expect(outcome.kind).toBe("book-continue");
		expect(outcome.state.text).toBe("c d");
		expect(outcome.state.result).toBeNull();
	});

	it("book mode exhausted returns to browser", () => {
		const book = makeBook([makeChapter(0, ["a", "b"])]);
		const session = applyBookSelection(
			createInitialSession({ type: "book", bookId: "", chapterIndex: 0 }),
			book,
			null,
			5,
		);
		// All 2 words consumed; feeder is complete
		const outcome = decideRedo(session, 5);
		expect(outcome.kind).toBe("book-finished");
		expect(outcome.state.activeBook).toBeNull();
		expect(outcome.state.bookFeeder).toBeNull();
		expect(outcome.state.text).toBeNull();
	});
});
