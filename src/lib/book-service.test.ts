import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	browseCatalog,
	FETCH_TIMEOUT_MS,
	fetchAndCacheBook,
	fetchBookDetail,
	fetchChapter,
	loadBookDetail,
	searchBooks,
} from "./book-service";
import { readSavedCatalogue } from "./catalogue-cache";
import {
	BookNotFoundError,
	BookServiceError,
	NetworkError,
} from "./core/types/errors";
import { db } from "./db";

/** Fakes only timers, so fake-indexeddb keeps its own scheduling. */
function useRetryClock(): void {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
}

/** Runs out every retry backoff, a little at a time. */
async function settle(): Promise<void> {
	for (let i = 0; i < 20; i++) await vi.advanceTimersByTimeAsync(500);
}

describe("book-service typed errors", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.useRealTimers();
	});

	it("throws NetworkError when fetch keeps rejecting", async () => {
		useRetryClock();
		globalThis.fetch = vi
			.fn()
			.mockRejectedValue(new TypeError("Failed to fetch")) as never;
		const result = fetchChapter("a/b", "ch-1", 0).catch((e) => e);
		await settle();
		const err = await result;
		expect(err).toBeInstanceOf(NetworkError);
		expect(err.timedOut).toBe(false);
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

	it("throws BookServiceError on a 500 that outlasts the retries", async () => {
		useRetryClock();
		const fetchMock = vi.fn(
			async () => new Response("server error", { status: 500 }),
		);
		globalThis.fetch = fetchMock as never;
		const result = fetchChapter("a/b", "ch-1", 0).catch((e) => e);
		await settle();
		expect(await result).toMatchObject({ kind: "book-service", status: 500 });
		expect(fetchMock).toHaveBeenCalledTimes(3);
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
		useRetryClock();
		globalThis.fetch = vi
			.fn()
			.mockResolvedValue(new Response("oops", { status: 502 })) as never;
		const result = searchBooks("anything").catch((e) => e);
		await settle();
		const err = await result;
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

	it("loads again after a failed load", async () => {
		useRetryClock();
		let online = false;
		globalThis.fetch = vi.fn((url: string) =>
			online
				? Promise.resolve(
						new Response(url.endsWith("/text") ? toc : detail, {
							status: 200,
						}),
					)
				: Promise.reject(new TypeError("offline")),
		) as never;

		const failed = loadBookDetail("x/retry").catch((e) => e);
		await settle();
		expect(await failed).toBeInstanceOf(NetworkError);
		online = true;
		expect((await loadBookDetail("x/retry")).wordCount).toBe(40658);
		vi.useRealTimers();
	});

	it("rides out a transient 503 on the detail page", async () => {
		useRetryClock();
		let detailCalls = 0;
		globalThis.fetch = vi.fn((url: string) => {
			if (url.endsWith("/text")) {
				return Promise.resolve(new Response(toc, { status: 200 }));
			}
			detailCalls++;
			return Promise.resolve(
				detailCalls === 1
					? new Response("busy", { status: 503 })
					: new Response(detail, { status: 200 }),
			);
		}) as never;

		const result = loadBookDetail("x/transient");
		await settle();
		expect((await result).wordCount).toBe(40658);
		expect(detailCalls).toBe(2);
		vi.useRealTimers();
	});
});

describe("same-origin proxy", () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("requests the catalogue through /se on this origin", async () => {
		const fetchMock = vi.fn(async () => new Response("", { status: 200 }));
		globalThis.fetch = fetchMock as never;

		await searchBooks("dickens", 2);

		const [url] = fetchMock.mock.calls[0] as unknown as [string];
		expect(url).toBe("/se/ebooks?query=dickens&per-page=48&page=2");
	});

	it("does not retry a 404 for a book", async () => {
		const fetchMock = vi.fn(
			async () => new Response("missing", { status: 404 }),
		);
		globalThis.fetch = fetchMock as never;

		await expect(fetchChapter("a/b", "ch-1", 0)).rejects.toBeInstanceOf(
			BookNotFoundError,
		);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});

/** A fetch that never answers until its signal aborts. */
function hangingFetch(url: string, init?: RequestInit): Promise<Response> {
	return new Promise((_, reject) => {
		init?.signal?.addEventListener("abort", () =>
			reject(new DOMException(`aborted ${url}`, "AbortError")),
		);
	});
}

describe("fetchBookDetail timing", () => {
	const originalFetch = globalThis.fetch;
	const detail = `<h1 property="schema:name">Oberland</h1>
<meta property="schema:wordCount" content="40658"/>`;
	const toc = `<a href="text/chapter-1">I</a>`;

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.useRealTimers();
	});

	it("requests the detail page and chapter list together", async () => {
		const fetchMock = vi.fn(hangingFetch);
		globalThis.fetch = fetchMock as never;

		fetchBookDetail("p/parallel").catch(() => {});
		await Promise.resolve();

		expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
			"/se/ebooks/p/parallel",
			"/se/ebooks/p/parallel/text",
		]);
	});

	it("gives up on a hung detail request with a NetworkError", async () => {
		useRetryClock();
		globalThis.fetch = vi.fn(hangingFetch) as never;

		const result = fetchBookDetail("p/hung").catch((e) => e);
		await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS);

		const err = await result;
		expect(err).toBeInstanceOf(NetworkError);
		expect(err.timedOut).toBe(true);
	});

	it("keeps the detail when only the chapter list hangs", async () => {
		useRetryClock();
		globalThis.fetch = vi.fn((url: string, init?: RequestInit) =>
			url.endsWith("/text")
				? hangingFetch(url, init)
				: Promise.resolve(new Response(detail, { status: 200 })),
		) as never;

		const result = fetchBookDetail("p/slow-toc");
		await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS);

		const meta = await result;
		expect(meta.wordCount).toBe(40658);
		expect(meta.chapters).toEqual([]);
	});

	it("fetchAndCacheBook reuses the detail the modal already loaded", async () => {
		const fetchMock = vi.fn((url: string) =>
			Promise.resolve(
				new Response(url.endsWith("/text") ? toc : detail, { status: 200 }),
			),
		);
		globalThis.fetch = fetchMock as never;

		await loadBookDetail("p/reuse");
		await fetchAndCacheBook("p/reuse");

		const urls = fetchMock.mock.calls.map(([url]) => url);
		expect(urls.filter((u) => u.endsWith("/ebooks/p/reuse"))).toHaveLength(1);
		expect(urls.filter((u) => u.endsWith("/p/reuse/text"))).toHaveLength(1);
		expect(urls).toContain("/se/ebooks/p/reuse/text/chapter-1");
	});

	it("does not remember a detail that came back without chapters", async () => {
		const fetchMock = vi.fn((url: string) =>
			Promise.resolve(
				url.endsWith("/text")
					? new Response("down", { status: 503 })
					: new Response(detail, { status: 200 }),
			),
		);
		globalThis.fetch = fetchMock as never;
		useRetryClock();

		const first = loadBookDetail("p/no-toc");
		await settle();
		expect((await first).chapters).toEqual([]);
		const second = loadBookDetail("p/no-toc");
		await settle();
		await second;

		// Each load: one detail fetch, and the chapter list tried three times.
		expect(fetchMock).toHaveBeenCalledTimes(8);
	});

	it("refuses to cache a book with no chapters", async () => {
		globalThis.fetch = vi.fn((url: string) =>
			Promise.resolve(
				url.endsWith("/text")
					? new Response("down", { status: 503 })
					: new Response(detail, { status: 200 }),
			),
		) as never;
		useRetryClock();

		const result = fetchAndCacheBook("p/empty").catch((e) => e);
		await settle();
		expect(await result).toBeInstanceOf(BookServiceError);
		expect(await db.cachedBooks.get("p/empty")).toBeUndefined();
	});
});

describe("catalogue read-through", () => {
	const originalFetch = globalThis.fetch;
	const page = `<li typeof="schema:Book" about="/ebooks/a/one"><a href="/ebooks/a/one"><span property="schema:name">One</span></a></li>`;

	beforeEach(() => localStorage.clear());
	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.useRealTimers();
	});

	it("saves the first browse page for the next visit", async () => {
		globalThis.fetch = vi.fn(
			async () => new Response(page, { status: 200 }),
		) as never;

		const books = await browseCatalog(1);

		expect(books.length).toBeGreaterThan(0);
		expect(readSavedCatalogue()?.books).toEqual(books);
	});

	it("keeps the saved copy when a refresh fails", async () => {
		useRetryClock();
		globalThis.fetch = vi.fn(
			async () => new Response(page, { status: 200 }),
		) as never;
		const saved = await browseCatalog(1);
		globalThis.fetch = vi.fn(
			async () => new Response("down", { status: 503 }),
		) as never;

		const result = browseCatalog(1).catch((e) => e);
		await settle();

		expect(await result).toBeInstanceOf(BookServiceError);
		expect(readSavedCatalogue()?.books).toEqual(saved);
	});

	it("does not save searches or later pages", async () => {
		globalThis.fetch = vi.fn(
			async () => new Response(page, { status: 200 }),
		) as never;

		await searchBooks("one");
		await browseCatalog(2);

		expect(readSavedCatalogue()).toBeNull();
	});
});
