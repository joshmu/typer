import { describe, expect, it } from "vitest";
import { createRngState } from "../sim/rng";
import { pickLetter, pickWord, pickWordForTier, type Tier } from "./words";

const RANGES: Record<Tier, [number, number]> = {
	1: [3, 4],
	2: [5, 6],
	3: [6, 8],
	4: [8, 12],
};

describe("pickWordForTier", () => {
	it("is deterministic per tier + seed", () => {
		for (const tier of [1, 2, 3, 4] as Tier[]) {
			const [w1] = pickWordForTier(tier, createRngState(5), new Set());
			const [w2] = pickWordForTier(tier, createRngState(5), new Set());
			expect(w1).toBe(w2);
		}
	});

	it("returns words inside each tier band", () => {
		for (const tier of [1, 2, 3, 4] as Tier[]) {
			let s = createRngState(tier * 7);
			const [lo, hi] = RANGES[tier];
			for (let i = 0; i < 40; i++) {
				const [w, n] = pickWordForTier(tier, s, new Set());
				expect(w.length).toBeGreaterThanOrEqual(lo);
				expect(w.length).toBeLessThanOrEqual(hi);
				s = n;
			}
		}
	});

	it("avoids excluded initials when possible", () => {
		let s = createRngState(1);
		for (let i = 0; i < 50; i++) {
			const [w, n] = pickWordForTier(3, s, new Set(["t", "a"]));
			expect(["t", "a"]).not.toContain(w[0]);
			s = n;
		}
	});
});

describe("pickWord (tier-1 alias)", () => {
	it("returns a short common word deterministically", () => {
		const [w1] = pickWord(createRngState(5), new Set());
		const [w2] = pickWord(createRngState(5), new Set());
		expect(w1).toBe(w2);
		expect(w1.length).toBeGreaterThanOrEqual(3);
		expect(w1.length).toBeLessThanOrEqual(4);
	});
});

describe("pickLetter", () => {
	it("draws a single a-z letter that avoids the excluded set", () => {
		let s = createRngState(1);
		for (let i = 0; i < 300; i++) {
			const [letter, n] = pickLetter(s, new Set(["a", "b", "c", "x"]));
			expect(letter).toMatch(/^[a-z]$/);
			expect(letter.length).toBe(1);
			expect(["a", "b", "c", "x"]).not.toContain(letter);
			s = n;
		}
	});

	it("is deterministic and advances the rng state", () => {
		const [l1, n1] = pickLetter(createRngState(7), new Set());
		const [l2, n2] = pickLetter(createRngState(7), new Set());
		expect(l1).toBe(l2);
		expect(n1).toBe(n2);
		expect(n1).not.toBe(createRngState(7));
	});

	it("falls back to the full alphabet when every letter is excluded", () => {
		const all = new Set("abcdefghijklmnopqrstuvwxyz".split(""));
		const [letter] = pickLetter(createRngState(3), all);
		expect(letter).toMatch(/^[a-z]$/);
	});
});
