import { describe, expect, it } from "vitest";
import { getQuotesByLength, getRandomQuote } from "./quotes";

describe("getRandomQuote", () => {
	it("returns a quote object", () => {
		const quote = getRandomQuote();
		expect(quote).toHaveProperty("text");
		expect(quote).toHaveProperty("source");
		expect(quote).toHaveProperty("length");
	});

	it("filters by length", () => {
		const short = getRandomQuote("short");
		expect(short.length).toBe("short");

		const medium = getRandomQuote("medium");
		expect(medium.length).toBe("medium");

		const long = getRandomQuote("long");
		expect(long.length).toBe("long");
	});
});

describe("getQuotesByLength", () => {
	it("returns only short quotes", () => {
		const shorts = getQuotesByLength("short");
		expect(shorts.length).toBeGreaterThan(0);
		for (const q of shorts) {
			expect(q.length).toBe("short");
		}
	});

	it("returns only medium quotes", () => {
		const mediums = getQuotesByLength("medium");
		expect(mediums.length).toBeGreaterThan(0);
		for (const q of mediums) {
			expect(q.length).toBe("medium");
		}
	});

	it("returns only long quotes", () => {
		const longs = getQuotesByLength("long");
		expect(longs.length).toBeGreaterThan(0);
		for (const q of longs) {
			expect(q.length).toBe("long");
		}
	});
});
