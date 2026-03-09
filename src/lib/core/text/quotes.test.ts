import { describe, expect, it } from "vitest";
import {
	getQuotesByLength,
	getRandomQuote,
	resetQuoteHistory,
} from "./quotes";

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

describe("quote id uniqueness", () => {
	it("each quote has a unique numeric id", () => {
		const all = [
			...getQuotesByLength("short"),
			...getQuotesByLength("medium"),
			...getQuotesByLength("long"),
		];
		const ids = all.map((q) => q.id);
		expect(new Set(ids).size).toBe(all.length);
		for (const id of ids) {
			expect(typeof id).toBe("number");
		}
	});
});

describe("no-repeat selection", () => {
	it("getRandomQuote cycles through all quotes before repeating", () => {
		resetQuoteHistory();
		const shorts = getQuotesByLength("short");
		const ids = new Set<number>();
		for (let i = 0; i < shorts.length; i++) {
			const q = getRandomQuote("short");
			ids.add(q.id);
		}
		expect(ids.size).toBe(shorts.length);
	});

	it("resetQuoteHistory clears tracking", () => {
		resetQuoteHistory();
		const shorts = getQuotesByLength("short");
		for (let i = 0; i < shorts.length; i++) {
			getRandomQuote("short");
		}
		resetQuoteHistory();
		const q = getRandomQuote("short");
		expect(q).toHaveProperty("id");
	});
});
