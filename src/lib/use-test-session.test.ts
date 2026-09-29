import "fake-indexeddb/auto";
import { createComputed, createRoot } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadWordList } from "@/lib/core/text/word-list-loader";
import type { TestMode, TypingState } from "@/lib/core/types";
import type { BookChapter, CachedBook } from "@/lib/core/types/book";
import { createTypingState } from "@/lib/core/types/test-fixtures";
import { db } from "@/lib/db";
import { setTypingActive } from "@/lib/typing-focus";
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

	it.each<TestMode>([{ type: "time", seconds: 30 }, { type: "zen" }])(
		"startWithMode('$type') refills from the chosen word list",
		async (mode) => {
			const list = await loadWordList("1k");
			const words = await new Promise<string[] | null>((resolve) =>
				createRoot(async (dispose) => {
					const session = useTestSession({ wordListSize: () => "1k" });
					await session.startWithMode(mode);
					const feed = session.feed();
					resolve(feed && `${session.text()} ${feed.next(50)}`.split(" "));
					dispose();
				}),
			);
			expect(words).not.toBeNull();
			for (const word of words ?? []) expect(list).toContain(word);
		},
	);

	describe("word-list loads that resolve late", () => {
		function deferredLists() {
			const pending: Array<(list: string[]) => void> = [];
			const load = vi.fn(
				() => new Promise<string[]>((resolve) => pending.push(resolve)),
			);
			return { load, pending };
		}

		afterEach(() => setTypingActive(false));

		it("ignores a load superseded by a newer mode choice", async () => {
			const { load, pending } = deferredLists();
			await createRoot(async (dispose) => {
				const session = useTestSession({
					wordListSize: () => "200",
					deps: { loadWordList: load },
				});
				const slow = session.startWithMode({ type: "time", seconds: 30 });
				const fast = session.startWithMode({ type: "words", count: 10 });
				pending[1](["b1", "b2"]);
				await fast;
				pending[0](["a1", "a2"]);
				await slow;
				expect(session.mode()).toEqual({ type: "words", count: 10 });
				expect(session.text()).toMatch(/^b\d( b\d)+$/);
				dispose();
			});
		});

		it("does not replace a test the user started typing meanwhile", async () => {
			const { load, pending } = deferredLists();
			await createRoot(async (dispose) => {
				const session = useTestSession({
					wordListSize: () => "200",
					deps: { loadWordList: load },
				});
				session.setCustomText("hello world");
				const loading = session.startWithMode({ type: "zen" });
				setTypingActive(true);
				pending[0](["a1", "a2"]);
				await loading;
				expect(session.mode()).toEqual({
					type: "book",
					bookId: "",
					chapterIndex: 0,
				});
				expect(session.text()).toBe("hello world");
				dispose();
			});
		});

		it("does not clear a finished test's result", async () => {
			const { load, pending } = deferredLists();
			await createRoot(async (dispose) => {
				const session = useTestSession({
					wordListSize: () => "200",
					deps: {
						loadWordList: load,
						recordCompletion: vi.fn().mockResolvedValue(undefined),
					},
				});
				session.setCustomText("the quick");
				const loading = session.startWithMode({ type: "words", count: 10 });
				session.complete(completedState("the quick"));
				pending[0](["a1", "a2"]);
				await loading;
				expect(session.result()).not.toBeNull();
				dispose();
			});
		});

		it("ignores a book fetch superseded by a newer mode choice", async () => {
			const book = makeBook([makeChapter(0, ["a", "b", "c"])]);
			let resolveFetch: (b: CachedBook) => void = () => {};
			const fetchAndCacheBook = vi.fn(
				() =>
					new Promise<CachedBook>((resolve) => {
						resolveFetch = resolve;
					}),
			);
			await createRoot(async (dispose) => {
				const session = useTestSession({
					wordListSize: () => "200",
					deps: { fetchAndCacheBook },
				});
				const selecting = session.selectBook("author/book");
				expect(session.bookLoading()).toBe(true);
				await session.startWithMode({ type: "quote", length: "short" });
				resolveFetch(book);
				await selecting;
				expect(session.mode().type).toBe("quote");
				expect(session.activeBook()).toBeNull();
				expect(session.bookLoading()).toBe(false);
				dispose();
			});
		});
	});

	it("setCustomText puts text on the session and clears prior result", () =>
		createRoot((dispose) => {
			const session = useTestSession({ wordListSize: () => "200" });
			session.setCustomText("hello world");
			expect(session.text()).toBe("hello world");
			dispose();
		}));

	it("selectBook populates activeBook, reader, and initial text", async () => {
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
				expect(session.bookReader()).not.toBeNull();
				expect(session.feed()).not.toBeNull();
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

	it("selectBook resumes from prior progress", async () => {
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

	it("complete records the typing result and sets session.result", async () => {
		const recordCompletion = vi.fn().mockResolvedValue(undefined);
		await new Promise<void>((resolve) =>
			createRoot((dispose) => {
				const session = useTestSession({
					wordListSize: () => "200",
					deps: { recordCompletion },
				});
				session.complete(completedState("the quick"));
				expect(session.result()).not.toBeNull();
				expect(session.result()?.accuracy).toBe(100);
				// Microtask flush
				setTimeout(() => {
					expect(recordCompletion).toHaveBeenCalledTimes(1);
					expect(recordCompletion.mock.calls[0][0]).toMatchObject({
						mode: "custom",
						accuracy: 100,
					});
					expect(recordCompletion.mock.calls[0][1]).toBeUndefined();
					dispose();
					resolve();
				}, 10);
			}),
		);
	});

	it("complete in book mode records the result with the committed progress", async () => {
		const book = makeBook([makeChapter(0, ["a", "b", "c", "d", "e", "f"])]);
		const recordCompletion = vi.fn().mockResolvedValue(undefined);
		await new Promise<void>((resolve) =>
			createRoot(async (dispose) => {
				const session = useTestSession({
					wordListSize: () => "200",
					deps: {
						fetchAndCacheBook: vi.fn().mockResolvedValue(book),
						recordCompletion,
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
					expect(recordCompletion).toHaveBeenCalledTimes(1);
					const [record, progress] = recordCompletion.mock.calls[0];
					expect(record).toMatchObject({
						mode: "book",
						bookTitle: "Test Book",
					});
					expect(progress).toMatchObject({
						bookId: "author/book",
						sessionCount: 1,
					});
					dispose();
					resolve();
				}, 10);
			}),
		);
	});

	it("redo in book mode continues after the committed words", async () => {
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
					deps: {
						fetchAndCacheBook: vi.fn().mockResolvedValue(book),
						recordCompletion: vi.fn().mockResolvedValue(undefined),
					},
				});
				await session.selectBook("author/book");
				const firstText = session.text() ?? "";
				const state = completedState(firstText);
				state.mode = { type: "book", bookId: "author/book", chapterIndex: 0 };
				session.complete(state);
				session.redo();
				expect(session.text()).toBe("ee ff gg hh ii jj");
				dispose();
				resolve();
			}),
		);
	});

	it("Continue after Esc mid-chunk resumes at the committed word and saves without drift", async () => {
		const words = Array.from({ length: 90 }, (_, i) => `w${i}`);
		const book = makeBook([makeChapter(0, words)]);
		const recordCompletion = vi.fn().mockResolvedValue(undefined);
		const typed = (text: string, wordsTyped: number): TypingState => {
			const state = completedState(text);
			state.currentWordIndex = wordsTyped;
			state.mode = { type: "book", bookId: "author/book", chapterIndex: 0 };
			return state;
		};
		await new Promise<void>((resolve, reject) =>
			createRoot(async (dispose) => {
				try {
					const session = useTestSession({
						wordListSize: () => "200",
						deps: {
							fetchAndCacheBook: vi.fn().mockResolvedValue(book),
							recordCompletion,
						},
					});
					await session.selectBook("author/book");
					expect(session.text()?.split(" ")).toHaveLength(30);

					session.complete(typed(session.text() ?? "", 10));
					expect(recordCompletion.mock.calls[0][1]).toMatchObject({
						chapterIndex: 0,
						wordOffset: 10,
					});
					expect(session.bookProgressPercent()).toBe(11);

					session.redo();
					expect(session.text()?.split(" ").slice(0, 3)).toEqual([
						"w10",
						"w11",
						"w12",
					]);

					session.complete(typed(session.text() ?? "", 5));
					expect(recordCompletion.mock.calls[1][1]).toMatchObject({
						chapterIndex: 0,
						wordOffset: 15,
					});
					session.redo();
					expect(session.text()?.split(" ")[0]).toBe("w15");
					resolve();
				} catch (err) {
					reject(err);
				} finally {
					dispose();
				}
			}),
		);
	});

	it("complete surfaces a failed record instead of swallowing it", async () => {
		const failure = new Error("disk full");
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		await new Promise<void>((resolve) =>
			createRoot((dispose) => {
				const session = useTestSession({
					wordListSize: () => "200",
					deps: { recordCompletion: vi.fn().mockRejectedValue(failure) },
				});
				session.complete(completedState("the quick"));
				setTimeout(() => {
					expect(errorSpy).toHaveBeenCalledWith(expect.any(String), failure);
					dispose();
					resolve();
				}, 10);
			}),
		);
	});

	it("flags the shown result as unsaved when recording fails", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const recordCompletion = vi
			.fn()
			.mockRejectedValueOnce(new Error("disk full"))
			.mockResolvedValue(undefined);
		await createRoot(async (dispose) => {
			const session = useTestSession({
				wordListSize: () => "200",
				deps: { recordCompletion },
			});
			session.setCustomText("the quick");
			session.complete(completedState("the quick"));
			expect(session.saveFailed()).toBe(false);
			await new Promise((r) => setTimeout(r));
			expect(session.result()).not.toBeNull();
			expect(session.saveFailed()).toBe(true);

			session.redo();
			session.setCustomText("the quick");
			session.complete(completedState("the quick"));
			await new Promise((r) => setTimeout(r));
			expect(session.saveFailed()).toBe(false);
			dispose();
		});
	});

	it("completing a test leaves the loaded test's accessors untouched", () =>
		createRoot((dispose) => {
			const session = useTestSession({
				wordListSize: () => "200",
				deps: { recordCompletion: vi.fn().mockResolvedValue(undefined) },
			});
			session.setCustomText("the quick");
			let runs = 0;
			createComputed(() => {
				session.text();
				session.mode();
				session.feed();
				runs++;
			});
			session.complete(completedState("the quick"));
			expect(session.result()).not.toBeNull();
			expect(runs).toBe(1);
			dispose();
		}));

	it("redo in custom mode clears text", () =>
		createRoot((dispose) => {
			const session = useTestSession({ wordListSize: () => "200" });
			session.setCustomText("foo");
			session.redo();
			expect(session.text()).toBeNull();
			dispose();
		}));
});
