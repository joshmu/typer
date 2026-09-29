import { describe, expect, it } from "vitest";
import { killScore } from "./score";

describe("score", () => {
	it("kill score scales with word length and combo", () => {
		expect(killScore(4, 1)).toBe(40);
		expect(killScore(4, 5)).toBe(80);
	});
});
