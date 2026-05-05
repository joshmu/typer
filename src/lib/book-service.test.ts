import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchBookDetail, fetchChapter, searchBooks } from "./book-service";
import {
	BookNotFoundError,
	BookServiceError,
	NetworkError,
} from "./core/types/errors";

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
