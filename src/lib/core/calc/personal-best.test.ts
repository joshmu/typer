import { describe, expect, it } from "vitest";
import { comparePersonalBest } from "./personal-best";

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
