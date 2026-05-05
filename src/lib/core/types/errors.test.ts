import { describe, expect, it } from "vitest";
import {
	AppError,
	BookCacheError,
	BookNotFoundError,
	BookServiceError,
	DatabaseError,
	isAppError,
	NetworkError,
} from "./errors";

describe("AppError hierarchy", () => {
	it("is an instance of Error", () => {
		const err = new AppError("oops", { kind: "app" });
		expect(err).toBeInstanceOf(Error);
		expect(err).toBeInstanceOf(AppError);
		expect(err.kind).toBe("app");
		expect(err.message).toBe("oops");
		expect(err.name).toBe("AppError");
	});

	it("BookNotFoundError carries the bookId", () => {
		const err = new BookNotFoundError("author/book");
		expect(err).toBeInstanceOf(AppError);
		expect(err).toBeInstanceOf(BookNotFoundError);
		expect(err.kind).toBe("book-not-found");
		expect(err.bookId).toBe("author/book");
		expect(err.name).toBe("BookNotFoundError");
	});

	it("BookServiceError carries the HTTP status", () => {
		const err = new BookServiceError("fetch chapter", 503);
		expect(err.kind).toBe("book-service");
		expect(err.status).toBe(503);
		expect(err.name).toBe("BookServiceError");
	});

	it("NetworkError wraps a cause", () => {
		const cause = new TypeError("Failed to fetch");
		const err = new NetworkError("offline", { cause });
		expect(err.kind).toBe("network");
		expect(err.cause).toBe(cause);
		expect(err.name).toBe("NetworkError");
	});

	it("DatabaseError signals fatal IndexedDB issues", () => {
		const err = new DatabaseError("DB corrupted");
		expect(err.kind).toBe("database");
		expect(err.name).toBe("DatabaseError");
	});

	it("BookCacheError signals non-fatal IndexedDB cache failures", () => {
		const err = new BookCacheError("write failed");
		expect(err.kind).toBe("book-cache");
		expect(err.name).toBe("BookCacheError");
	});

	it("isAppError narrows generic Errors", () => {
		expect(isAppError(new BookNotFoundError("x"))).toBe(true);
		expect(isAppError(new Error("plain"))).toBe(false);
		expect(isAppError("string")).toBe(false);
		expect(isAppError(null)).toBe(false);
	});

	it("kind values are exhaustively assignable to AppErrorKind union", () => {
		const errors: AppError[] = [
			new BookNotFoundError("a"),
			new BookServiceError("a", 500),
			new NetworkError("a"),
			new DatabaseError("a"),
			new BookCacheError("a"),
		];
		for (const err of errors) {
			// Force the discriminator to be exhaustive: any unhandled kind is a
			// type error at compile time.
			switch (err.kind) {
				case "book-not-found":
				case "book-service":
				case "network":
				case "database":
				case "book-cache":
				case "app":
					break;
				default: {
					const _exhaustive: never = err.kind;
					throw new Error(`Unexpected kind: ${_exhaustive}`);
				}
			}
		}
	});
});
