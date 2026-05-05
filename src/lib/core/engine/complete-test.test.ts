import { describe, expect, it } from "vitest";
import type { BookChapter, BookProgress, CachedBook } from "../types/book";
import {
	createCorrectChar,
	createIncorrectChar,
	createTypingState,
} from "../types/test-fixtures";
import { completeTest, computeNextBookProgress } from "./complete-test";

function buildState(opts: {
	correct: number;
	incorrect?: number;
	durationMs: number;
	startTime?: number;
}) {
	const total = opts.correct + (opts.incorrect ?? 0);
	const text = "x".repeat(total);
	const state = createTypingState(text, {
		startTime: opts.startTime ?? 1_000_000,
		endTime: (opts.startTime ?? 1_000_000) + opts.durationMs,
	});
	const chars = state.words.flatMap((w) => w.characters);
	for (let i = 0; i < opts.correct; i++) {
		const char = chars[i];
		Object.assign(char, createCorrectChar(char.expected));
	}
	for (let i = 0; i < (opts.incorrect ?? 0); i++) {
		const char = chars[opts.correct + i];
		Object.assign(char, createIncorrectChar(char.expected, "z"));
	}
	return state;
}

describe("completeTest", () => {
	it("returns zero metrics when nothing was typed", () => {
		const state = createTypingState("hello world");
		const out = completeTest(state);
		expect(out.result.wpm).toBe(0);
		expect(out.result.rawWpm).toBe(0);
		expect(out.result.accuracy).toBe(100); // accuracy defaults to 100 when nothing typed
		expect(out.result.elapsed).toBe(0);
		expect(out.charCount).toBe(11);
		expect(out.errorCount).toBe(0);
	});

	it("computes WPM from correct chars over elapsed time", () => {
		// 25 correct chars in 30s = 25/5 / (30/60) = 5 / 0.5 = 10 WPM
		const state = buildState({ correct: 25, durationMs: 30_000 });
		const out = completeTest(state);
		expect(out.result.wpm).toBe(10);
		expect(out.result.rawWpm).toBe(10);
		expect(out.result.accuracy).toBe(100);
		expect(out.result.elapsed).toBe(30_000);
	});

	it("includes incorrect in raw WPM but not in net WPM", () => {
		const state = buildState({ correct: 20, incorrect: 5, durationMs: 30_000 });
		const out = completeTest(state);
		expect(out.result.wpm).toBe(8); // 20/5 / 0.5
		expect(out.result.rawWpm).toBe(10); // 25/5 / 0.5
		expect(out.result.accuracy).toBe(80);
	});

	it("populates breakdown counts", () => {
		const state = buildState({ correct: 6, incorrect: 4, durationMs: 10_000 });
		const out = completeTest(state);
		expect(out.result.breakdown).toEqual({
			correct: 6,
			incorrect: 4,
			missed: 0,
			extra: 0,
			total: 10,
		});
		expect(out.charCount).toBe(10);
		expect(out.errorCount).toBe(4);
	});

	it("collects per-second WPM snapshots", () => {
		const state = buildState({
			correct: 25,
			durationMs: 30_000,
			startTime: 1_000_000,
		});
		const out = completeTest(state);
		expect(Array.isArray(out.result.wpmPerSecond)).toBe(true);
	});
});

function makeChapter(index: number, wordCount: number): BookChapter {
	const words = Array.from({ length: wordCount }, (_, i) => `word${i}`);
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

describe("computeNextBookProgress", () => {
	it("creates fresh progress when no prior state", () => {
		const book = makeBook([makeChapter(0, 100)]);
		const state = createTypingState("a b c", {
			currentWordIndex: 3,
			startTime: 0,
			endTime: 60_000,
		});
		const progress = computeNextBookProgress({
			book,
			state,
			prev: null,
			result: {
				wpm: 30,
				rawWpm: 32,
				accuracy: 95,
				consistency: 88,
				breakdown: {
					correct: 15,
					incorrect: 0,
					missed: 0,
					extra: 0,
					total: 15,
				},
				elapsed: 60_000,
				wpmPerSecond: [],
			},
			charCount: 15,
			now: 5_000_000,
		});
		expect(progress.bookId).toBe("author/book");
		expect(progress.chapterIndex).toBe(0);
		expect(progress.wordOffset).toBe(3);
		expect(progress.completedChapters).toEqual([]);
		expect(progress.totalCharsTyped).toBe(15);
		expect(progress.totalTimeMs).toBe(60_000);
		expect(progress.averageWpm).toBe(30);
		expect(progress.sessionCount).toBe(1);
		expect(progress.lastAccessedAt).toBe(5_000_000);
		expect(progress.startedAt).toBe(5_000_000);
		expect(progress.bookMeta).toEqual(book.meta);
	});

	it("merges with previous progress and updates running average", () => {
		const book = makeBook([makeChapter(0, 100)]);
		const prev: BookProgress = {
			bookId: "author/book",
			chapterIndex: 0,
			wordOffset: 10,
			completedChapters: [],
			totalCharsTyped: 50,
			totalTimeMs: 60_000,
			averageWpm: 40,
			sessionCount: 2,
			lastAccessedAt: 1_000,
			startedAt: 500,
			bookMeta: book.meta,
		};
		const state = createTypingState("a b c d", {
			currentWordIndex: 4,
			startTime: 0,
			endTime: 30_000,
		});
		const progress = computeNextBookProgress({
			book,
			state,
			prev,
			result: {
				wpm: 70,
				rawWpm: 72,
				accuracy: 99,
				consistency: 90,
				breakdown: {
					correct: 20,
					incorrect: 0,
					missed: 0,
					extra: 0,
					total: 20,
				},
				elapsed: 30_000,
				wpmPerSecond: [],
			},
			charCount: 20,
			now: 10_000,
		});
		// Previous offset 10 + 4 typed words = 14
		expect(progress.wordOffset).toBe(14);
		expect(progress.totalCharsTyped).toBe(70);
		expect(progress.totalTimeMs).toBe(90_000);
		// (40 * 2 + 70) / 3 = 50
		expect(progress.averageWpm).toBe(50);
		expect(progress.sessionCount).toBe(3);
		expect(progress.startedAt).toBe(500);
		expect(progress.lastAccessedAt).toBe(10_000);
	});

	it("appends crossed chapters to completedChapters", () => {
		const book = makeBook([
			makeChapter(0, 5),
			makeChapter(1, 5),
			makeChapter(2, 100),
		]);
		const state = createTypingState("a b c d e f g h i j k l", {
			currentWordIndex: 12,
			startTime: 0,
			endTime: 60_000,
		});
		const progress = computeNextBookProgress({
			book,
			state,
			prev: null,
			result: {
				wpm: 60,
				rawWpm: 60,
				accuracy: 100,
				consistency: 95,
				breakdown: {
					correct: 60,
					incorrect: 0,
					missed: 0,
					extra: 0,
					total: 60,
				},
				elapsed: 60_000,
				wpmPerSecond: [],
			},
			charCount: 60,
			now: 1,
		});
		expect(progress.chapterIndex).toBe(2);
		expect(progress.wordOffset).toBe(2);
		expect(progress.completedChapters).toEqual([0, 1]);
	});

	it("does not duplicate already-completed chapters", () => {
		const book = makeBook([
			makeChapter(0, 5),
			makeChapter(1, 5),
			makeChapter(2, 100),
		]);
		const prev: BookProgress = {
			bookId: "author/book",
			chapterIndex: 1,
			wordOffset: 0,
			completedChapters: [0],
			totalCharsTyped: 0,
			totalTimeMs: 0,
			averageWpm: 0,
			sessionCount: 0,
			lastAccessedAt: 0,
			startedAt: 0,
			bookMeta: book.meta,
		};
		const state = createTypingState("a b c d e f g", {
			currentWordIndex: 7,
			startTime: 0,
			endTime: 10_000,
		});
		const progress = computeNextBookProgress({
			book,
			state,
			prev,
			result: {
				wpm: 50,
				rawWpm: 50,
				accuracy: 100,
				consistency: 90,
				breakdown: {
					correct: 30,
					incorrect: 0,
					missed: 0,
					extra: 0,
					total: 30,
				},
				elapsed: 10_000,
				wpmPerSecond: [],
			},
			charCount: 30,
			now: 1,
		});
		// Should add chapter 1 (now completed), keep 0
		expect(progress.completedChapters).toEqual([0, 1]);
		expect(progress.chapterIndex).toBe(2);
		expect(progress.wordOffset).toBe(2);
	});
});
