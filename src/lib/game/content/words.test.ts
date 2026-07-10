import { describe, expect, it } from "vitest";
import { createRngState } from "../sim/rng";
import { pickWord } from "./words";

describe("pickWord", () => {
	it("is deterministic and 3-6 chars", () => {
		const [w1] = pickWord(createRngState(5), new Set());
		const [w2] = pickWord(createRngState(5), new Set());
		expect(w1).toBe(w2);
		expect(w1.length).toBeGreaterThanOrEqual(3);
		expect(w1.length).toBeLessThanOrEqual(6);
	});
	it("avoids excluded initials when possible", () => {
		let s = createRngState(1);
		for (let i = 0; i < 50; i++) {
			const [w, n] = pickWord(s, new Set(["t", "a"]));
			expect(["t", "a"]).not.toContain(w[0]);
			s = n;
		}
	});
});
