import { describe, expect, it } from "vitest";
import {
	DEFAULT_MODE,
	landingMode,
	MODE_DEFAULTS,
	sanitizeMode,
} from "./last-mode";

describe("sanitizeMode", () => {
	it("defaults to a time 30 test", () => {
		expect(DEFAULT_MODE).toEqual({ type: "time", seconds: 30 });
		expect(sanitizeMode(undefined)).toEqual(DEFAULT_MODE);
		expect(sanitizeMode(null)).toEqual(DEFAULT_MODE);
		expect(sanitizeMode("time")).toEqual(DEFAULT_MODE);
		expect(sanitizeMode({ type: "nope" })).toEqual(DEFAULT_MODE);
	});

	it("keeps a valid mode and its sub-option", () => {
		expect(sanitizeMode({ type: "time", seconds: 60 })).toEqual({
			type: "time",
			seconds: 60,
		});
		expect(sanitizeMode({ type: "words", count: 100 })).toEqual({
			type: "words",
			count: 100,
		});
		expect(sanitizeMode({ type: "quote", length: "long" })).toEqual({
			type: "quote",
			length: "long",
		});
		expect(sanitizeMode({ type: "zen" })).toEqual({ type: "zen" });
		expect(sanitizeMode({ type: "custom" })).toEqual({ type: "custom" });
		expect(
			sanitizeMode({ type: "book", bookId: "a/b", chapterIndex: 3 }),
		).toEqual({ type: "book", bookId: "a/b", chapterIndex: 3 });
	});

	it("fills a missing or invalid sub-option from that mode's default", () => {
		expect(sanitizeMode({ type: "time", seconds: 45 })).toEqual(
			MODE_DEFAULTS.time,
		);
		expect(sanitizeMode({ type: "words" })).toEqual(MODE_DEFAULTS.words);
		expect(sanitizeMode({ type: "quote", length: 3 })).toEqual(
			MODE_DEFAULTS.quote,
		);
		expect(sanitizeMode({ type: "book" })).toEqual({
			type: "book",
			bookId: "",
			chapterIndex: 0,
		});
	});

	it("drops fields that belong to another mode", () => {
		expect(sanitizeMode({ type: "time", seconds: 15, count: 25 })).toEqual({
			type: "time",
			seconds: 15,
		});
	});
});

describe("landingMode", () => {
	it("restores the last mode", () => {
		expect(landingMode({ type: "words", count: 50 })).toEqual({
			type: "words",
			count: 50,
		});
	});

	it("falls back to time from custom, which has no text to restore", () => {
		expect(landingMode({ type: "custom" })).toEqual(DEFAULT_MODE);
	});
});
