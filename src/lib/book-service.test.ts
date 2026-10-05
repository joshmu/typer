import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	fetchBookDetail,
	fetchChapter,
	loadBookDetail,
	searchBooks,
} from "./book-service";
import {
	BookNotFoundError,
	BookServiceError,
	NetworkError,
} from "./core/types/errors";
import { db } from "./db";

describe("book-service typed errors", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("throws NetworkError when fetch rejects", async () => {
		globalThis.fetch = vi
			.fn()
			.mockRejectedValueOnce(new TypeError("Failed to fetch")) as never;
		await expect(fetchChapter("a/b", "ch-1", 0)).rejects.toBeInstanceOf(
			NetworkError,
		);
	});

	it("throws BookNotFoundError on 404 for a known bookId", async () => {
		globalThis.fetch = vi
			.fn()
			.mockResolvedValueOnce(
				new Response("not found", { status: 404 }),
			) as never;
		await expect(fetchChapter("a/b", "ch-1", 0)).rejects.toBeInstanceOf(
			BookNotFoundError,
		);
	});

	it("throws BookServiceError on 500", async () => {
		globalThis.fetch = vi
			.fn()
			.mockResolvedValueOnce(
				new Response("server error", { status: 500 }),
			) as never;
		await expect(fetchChapter("a/b", "ch-1", 0)).rejects.toMatchObject({
			kind: "book-service",
			status: 500,
		});
	});

	it("BookNotFoundError carries the bookId", async () => {
		globalThis.fetch = vi
			.fn()
			.mockResolvedValueOnce(
				new Response("not found", { status: 404 }),
			) as never;
		try {
			await fetchBookDetail("author/title");
			throw new Error("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(BookNotFoundError);
			if (err instanceof BookNotFoundError) {
				expect(err.bookId).toBe("author/title");
			}
		}
	});

	it("catalog 5xx throws BookServiceError, not BookNotFoundError", async () => {
		globalThis.fetch = vi
			.fn()
			.mockResolvedValueOnce(new Response("oops", { status: 502 })) as never;
		const err = await searchBooks("anything").catch((e) => e);
		expect(err).toBeInstanceOf(BookServiceError);
		expect(err).not.toBeInstanceOf(BookNotFoundError);
	});
});

describe("loadBookDetail", () => {
	const originalFetch = globalThis.fetch;
	const detail = `<h1 property="schema:name">Oberland</h1>
<meta property="schema:abstract" content="A trip to Switzerland."/>
<meta property="schema:wordCount" content="40658"/>`;
	const toc = `<a href="text/chapter-1">I</a><a href="text/chapter-2">II</a>`;

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("fetches the detail and chapter list once per book", async () => {
		const fetchMock = vi.fn((url: string) =>
			Promise.resolve(
				new Response(url.endsWith("/text") ? toc : detail, { status: 200 }),
			),
		);
		globalThis.fetch = fetchMock as never;

		const first = await loadBookDetail("x/once");
		const second = await loadBookDetail("x/once");

		expect(first.wordCount).toBe(40658);
		expect(first.description).toBe("A trip to Switzerland.");
		expect(first.chapters).toEqual(["chapter-1", "chapter-2"]);
		expect(second).toBe(first);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("uses the cached book's metadata without fetching", async () => {
		const fetchMock = vi.fn();
		globalThis.fetch = fetchMock as never;
		const meta = {
			id: "x/cached",
			title: "Cached",
			author: "A",
			description: "From cache",
			language: "en",
			wordCount: 10,
			coverUrl: "",
			coverHeroUrl: "",
			chapters: ["chapter-1"],
			datePublished: "",
			dateModified: "",
		};
		await db.cachedBooks.put({
			bookId: meta.id,
			meta,
			chapters: [],
			cachedAt: 0,
		});

		expect(await loadBookDetail("x/cached")).toEqual(meta);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("retries after a failed load", async () => {
		globalThis.fetch = vi
			.fn()
			.mockRejectedValueOnce(new TypeError("offline"))
			.mockImplementation((url: string) =>
				Promise.resolve(
					new Response(url.endsWith("/text") ? toc : detail, {
						status: 200,
					}),
				),
			) as never;

		await expect(loadBookDetail("x/retry")).rejects.toBeInstanceOf(
			NetworkError,
		);
		expect((await loadBookDetail("x/retry")).wordCount).toBe(40658);
	});
});
