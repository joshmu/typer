import "fake-indexeddb/auto";
import { createRoot } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TypingState } from "@/lib/core/types";
import type { BookChapter, CachedBook } from "@/lib/core/types/book";
import { createTypingState } from "@/lib/core/types/test-fixtures";
import { db } from "@/lib/db";
import { useTestSession } from "./use-test-session";

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

function completedState(text: string, durationMs = 60_000): TypingState {
	const state = createTypingState(text, {
		startTime: 1_000_000,
		endTime: 1_000_000 + durationMs,
		currentWordIndex: text.split(" ").length,
	});
	for (const word of state.words) {
		for (const char of word.characters) {
			char.typed = char.expected;
			char.status = "correct";
		}
	}
	return state;
}

describe("useTestSession", () => {
	beforeEach(async () => {
		// Ensure test isolation across DB.
		await db.results.clear().catch(() => {});
		await db.bookProgress.clear().catch(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("starts in book mode with no text", () =>
		createRoot((dispose) => {
			const session = useTestSession({ wordListSize: () => "200" });
			expect(session.mode().type).toBe("book");
			expect(session.text()).toBeNull();
			expect(session.result()).toBeNull();
			expect(session.activeBook()).toBeNull();
			dispose();
		}));

	it("startWithMode('custom') leaves text null", async () => {
		await new Promise<void>((resolve) =>
			createRoot(async (dispose) => {
				const session = useTestSession({ wordListSize: () => "200" });
				await session.startWithMode({ type: "custom" });
				expect(session.mode()).toEqual({ type: "custom" });
				expect(session.text()).toBeNull();
				dispose();
				resolve();
			}),
		);
	});

	it("startWithMode('zen') populates text from generator", async () => {
		await new Promise<void>((resolve) =>
			createRoot(async (dispose) => {
				const session = useTestSession({ wordListSize: () => "200" });
				await session.startWithMode({ type: "zen" });
				expect(session.mode()).toEqual({ type: "zen" });
				expect(session.text()).not.toBeNull();
				expect((session.text() ?? "").split(" ").length).toBeGreaterThan(0);
				dispose();
				resolve();
			}),
		);
	});

	it("setCustomText puts text on the session and clears prior result", () =>
		createRoot((dispose) => {
			const session = useTestSession({ wordListSize: () => "200" });
			session.setCustomText("hello world");
			expect(session.text()).toBe("hello world");
			dispose();
		}));

	it("selectBook populates activeBook, feeder, and initial text", async () => {
		const book = makeBook([
			makeChapter(0, ["a", "b", "c", "d", "e", "f"]),
			makeChapter(1, ["g", "h"]),
		]);
		await new Promise<void>((resolve) =>
			createRoot(async (dispose) => {
				const session = useTestSession({
					wordListSize: () => "200",
					deps: {
						fetchAndCacheBook: vi.fn().mockResolvedValue(book),
					},
				});
				await session.selectBook("author/book");
				expect(session.activeBook()).toBe(book);
				expect(session.bookFeeder()).not.toBeNull();
				expect(session.text()).toBe("a b c d e f g h");
				expect(session.mode()).toEqual({
					type: "book",
					bookId: "author/book",
					chapterIndex: 0,
				});
				expect(session.bookLoading()).toBe(false);
				dispose();
				resolve();
			}),
		);
	});

	it("selectBook resumes feeder from prior progress", async () => {
		const book = makeBook([
			makeChapter(0, ["a", "b", "c"]),
			makeChapter(1, ["d", "e", "f"]),
		]);
		await new Promise<void>((resolve) =>
			createRoot(async (dispose) => {
				const session = useTestSession({
					wordListSize: () => "200",
					deps: {
						fetchAndCacheBook: vi.fn().mockResolvedValue(book),
					},
				});
				await session.selectBook("author/book", {
					id: 1,
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
				});
				expect(session.text()).toBe("e f");
				expect(session.mode()).toEqual({
					type: "book",
					bookId: "author/book",
					chapterIndex: 1,
				});
				dispose();
				resolve();
			}),
		);
	});

	it("complete writes a typing result and sets session.result", async () => {
		const saveTypingResult = vi.fn().mockResolvedValue(1);
		await new Promise<void>((resolve) =>
			createRoot((dispose) => {
				const session = useTestSession({
					wordListSize: () => "200",
					deps: { saveTypingResult },
				});
				session.complete(completedState("the quick"));
				expect(session.result()).not.toBeNull();
				expect(session.result()?.accuracy).toBe(100);
				// Microtask flush
				setTimeout(() => {
					expect(saveTypingResult).toHaveBeenCalledTimes(1);
					expect(saveTypingResult.mock.calls[0][0]).toMatchObject({
						mode: "custom",
						accuracy: 100,
					});
					dispose();
					resolve();
				}, 10);
			}),
		);
	});

	it("complete in book mode also persists book progress", async () => {
		const book = makeBook([makeChapter(0, ["a", "b", "c", "d", "e", "f"])]);
		const saveBookProgress = vi.fn().mockResolvedValue(undefined);
		const saveTypingResult = vi.fn().mockResolvedValue(1);
		await new Promise<void>((resolve) =>
			createRoot(async (dispose) => {
				const session = useTestSession({
					wordListSize: () => "200",
					deps: {
						fetchAndCacheBook: vi.fn().mockResolvedValue(book),
						saveBookProgress,
						saveTypingResult,
					},
				});
				await session.selectBook("author/book");
				const state = completedState(session.text() ?? "");
				state.mode = {
					type: "book",
					bookId: "author/book",
					chapterIndex: 0,
				};
				session.complete(state);
				setTimeout(() => {
					expect(saveBookProgress).toHaveBeenCalledTimes(1);
					expect(saveBookProgress.mock.calls[0][0]).toMatchObject({
						bookId: "author/book",
						sessionCount: 1,
					});
					expect(saveTypingResult.mock.calls[0][0]).toMatchObject({
						mode: "book",
						bookTitle: "Test Book",
					});
					dispose();
					resolve();
				}, 10);
			}),
		);
	});

	it("redo in book mode pulls more words from feeder", async () => {
		const book = makeBook([
			makeChapter(0, [
				"a",
				"b",
				"c",
				"d",
				"e",
				"f",
				"g",
				"h",
				"i",
				"j",
				"k",
				"l",
				"m",
				"n",
				"o",
				"p",
				"q",
				"r",
				"s",
				"t",
				"u",
				"v",
				"w",
				"x",
				"y",
				"z",
				"aa",
				"bb",
				"cc",
				"dd",
				"ee",
				"ff",
				"gg",
				"hh",
				"ii",
				"jj",
			]),
		]);
		await new Promise<void>((resolve) =>
			createRoot(async (dispose) => {
				const session = useTestSession({
					wordListSize: () => "200",
					deps: { fetchAndCacheBook: vi.fn().mockResolvedValue(book) },
				});
				await session.selectBook("author/book");
				const firstText = session.text();
				expect(firstText).not.toBeNull();
				session.redo();
				expect(session.text()).not.toBe(firstText);
				expect(session.text()).not.toBeNull();
				dispose();
				resolve();
			}),
		);
	});

	it("redo in custom mode clears text", () =>
		createRoot((dispose) => {
			const session = useTestSession({ wordListSize: () => "200" });
			session.setCustomText("foo");
			session.redo();
			expect(session.text()).toBeNull();
			dispose();
		}));
});
