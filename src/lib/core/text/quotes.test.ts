import { describe, expect, it } from "vitest";
import {
	getQuotesByLength,
	getRandomQuote,
	loadExpandedQuotes,
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

describe("expanded quotes data", () => {
	it("contains at least 100 entries", async () => {
		const data = (await import("./data/quotes.json")).default;
		expect(data.length).toBeGreaterThanOrEqual(100);
	});

	it("all ids are unique", async () => {
		const data = (await import("./data/quotes.json")).default;
		const ids = data.map((q: { id: number }) => q.id);
		expect(new Set(ids).size).toBe(data.length);
	});

	it("ids do not overlap with inline quotes", async () => {
		const data = (await import("./data/quotes.json")).default;
		const expandedIds = new Set(data.map((q: { id: number }) => q.id));
		const inlineQuotes = [
			...getQuotesByLength("short"),
			...getQuotesByLength("medium"),
			...getQuotesByLength("long"),
		];
		for (const q of inlineQuotes) {
			expect(expandedIds.has(q.id)).toBe(false);
		}
	});

	it("has length distribution: at least 20 short, 30 medium, 15 long", async () => {
		const data = (await import("./data/quotes.json")).default;
		const short = data.filter(
			(q: { length: string }) => q.length === "short",
		).length;
		const medium = data.filter(
			(q: { length: string }) => q.length === "medium",
		).length;
		const long = data.filter(
			(q: { length: string }) => q.length === "long",
		).length;
		expect(short).toBeGreaterThanOrEqual(20);
		expect(medium).toBeGreaterThanOrEqual(30);
		expect(long).toBeGreaterThanOrEqual(15);
	});
});

describe("loadExpandedQuotes", () => {
	it("expands the quote pool to at least 128 quotes", async () => {
		await loadExpandedQuotes();
		resetQuoteHistory();
		const all = [
			...getQuotesByLength("short"),
			...getQuotesByLength("medium"),
			...getQuotesByLength("long"),
		];
		expect(all.length).toBeGreaterThanOrEqual(128);
	});
});
