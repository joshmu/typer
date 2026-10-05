import { describe, expect, it } from "vitest";
import { describeBookError } from "./book-errors";
import {
	BookNotFoundError,
	BookServiceError,
	BookUnsupportedError,
	NetworkError,
} from "./core/types/errors";

describe("describeBookError", () => {
	it("says so when the browser is offline, whatever failed", () => {
		const d = describeBookError(new NetworkError("x"), false);
		expect(d.title).toMatch(/offline/i);
		expect(d.retryable).toBe(true);
	});

	it("tells a timeout from a refused connection", () => {
		const slow = describeBookError(
			new NetworkError("x", { timedOut: true }),
			true,
		);
		const refused = describeBookError(new NetworkError("x"), true);
		expect(slow.title).toMatch(/too long/i);
		expect(refused.title).toMatch(/couldn't reach/i);
	});

	it("calls a 429 busy and a 5xx trouble, quoting the status", () => {
		expect(
			describeBookError(new BookServiceError("x", 429), true).title,
		).toMatch(/busy/i);
		const down = describeBookError(new BookServiceError("x", 503), true);
		expect(down.title).toMatch(/trouble/i);
		expect(down.body).toContain("503");
		expect(down.retryable).toBe(true);
	});

	it("does not offer a retry for a book with nothing to type", () => {
		const d = describeBookError(new BookUnsupportedError("a/b"), true);
		expect(d.title).toMatch(/can't be typed/i);
		expect(d.retryable).toBe(false);
	});

	it("does not offer a retry for a book that is gone", () => {
		const d = describeBookError(new BookNotFoundError("a/b"), true);
		expect(d.title).toMatch(/isn't available/i);
		expect(d.retryable).toBe(false);
	});

	it("falls back to a plain message for anything else", () => {
		const d = describeBookError(new Error("boom"), true);
		expect(d.title).toMatch(/went wrong/i);
		expect(d.retryable).toBe(true);
	});
});
