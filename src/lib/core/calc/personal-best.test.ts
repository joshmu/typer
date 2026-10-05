import { describe, expect, it } from "vitest";
import { bestScope, comparePersonalBest } from "./personal-best";

describe("comparePersonalBest", () => {
	it("reports a new best and the margin over the old one", () => {
		expect(comparePersonalBest(92, 80, false)).toEqual({
			kind: "new",
			delta: 12,
			previous: 80,
		});
	});

	it("holds the old best when the result ties or falls short", () => {
		expect(comparePersonalBest(80, 80, false)).toEqual({
			kind: "held",
			best: 80,
		});
		expect(comparePersonalBest(70, 80, false)).toEqual({
			kind: "held",
			best: 80,
		});
	});

	it("marks the first counted result in a mode", () => {
		expect(comparePersonalBest(60, null, false)).toEqual({ kind: "first" });
	});

	it("never counts an AFK result, however fast", () => {
		expect(comparePersonalBest(150, 80, true)).toEqual({ kind: "afk" });
	});

	it("has nothing to say about a zero result with no history", () => {
		expect(comparePersonalBest(0, null, false)).toEqual({ kind: "none" });
	});
});

describe("bestScope", () => {
	it("compares time tests of the same length", () => {
		expect(bestScope({ type: "time", seconds: 30 })).toEqual({
			mode: "time",
			duration: 30,
		});
	});

	it("compares words tests of the same count and quotes of the same length", () => {
		expect(bestScope({ type: "words", count: 25 })).toEqual({
			mode: "words",
			option: "25",
		});
		expect(bestScope({ type: "quote", length: "short" })).toEqual({
			mode: "quote",
			option: "short",
		});
	});

	it("has no best for book, custom and zen", () => {
		expect(bestScope({ type: "book", bookId: "a/b", chapterIndex: 0 })).toBe(
			null,
		);
		expect(bestScope({ type: "custom" })).toBeNull();
		expect(bestScope({ type: "zen" })).toBeNull();
	});
});
