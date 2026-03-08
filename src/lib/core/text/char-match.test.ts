import { describe, expect, it } from "vitest";
import { isCharMatch } from "./char-match";

describe("isCharMatch", () => {
	describe("exact matches (fast path)", () => {
		it("matches identical ASCII characters", () => {
			expect(isCharMatch("a", "a")).toBe(true);
			expect(isCharMatch("Z", "Z")).toBe(true);
			expect(isCharMatch(" ", " ")).toBe(true);
			expect(isCharMatch("1", "1")).toBe(true);
		});

		it("rejects different ASCII characters", () => {
			expect(isCharMatch("a", "b")).toBe(false);
			expect(isCharMatch("z", "s")).toBe(false);
			expect(isCharMatch("1", "2")).toBe(false);
		});
	});

	describe("diacritic matches via NFD decomposition", () => {
		it("accepts base character for accented expected", () => {
			expect(isCharMatch("z", "\u017E")).toBe(true); // ž (z-caron)
			expect(isCharMatch("u", "\u016F")).toBe(true); // ů (u-ring)
			expect(isCharMatch("e", "\u00E9")).toBe(true); // é (e-acute)
			expect(isCharMatch("n", "\u00F1")).toBe(true); // ñ (n-tilde)
			expect(isCharMatch("c", "\u00E7")).toBe(true); // ç (c-cedilla)
			expect(isCharMatch("a", "\u00E0")).toBe(true); // à (a-grave)
			expect(isCharMatch("o", "\u00F6")).toBe(true); // ö (o-diaeresis)
		});

		it("preserves case sensitivity for diacritics", () => {
			expect(isCharMatch("Z", "\u017D")).toBe(true); // Ž (uppercase Z-caron)
			expect(isCharMatch("z", "\u017D")).toBe(false); // lowercase z vs uppercase Ž
			expect(isCharMatch("E", "\u00C9")).toBe(true); // É (uppercase E-acute)
			expect(isCharMatch("e", "\u00C9")).toBe(false); // lowercase e vs uppercase É
		});

		it("still accepts exact diacritic match", () => {
			expect(isCharMatch("\u017E", "\u017E")).toBe(true); // ž === ž
			expect(isCharMatch("\u00E9", "\u00E9")).toBe(true); // é === é
		});
	});

	describe("non-decomposable characters", () => {
		it("rejects base char for ligatures (no canonical decomposition)", () => {
			expect(isCharMatch("a", "\u00E6")).toBe(false); // æ (ae ligature)
			expect(isCharMatch("o", "\u0153")).toBe(false); // œ (oe ligature)
		});

		it("rejects base char for sharp s", () => {
			expect(isCharMatch("s", "\u00DF")).toBe(false); // ß
		});
	});

	describe("edge cases", () => {
		it("rejects wrong base character for diacritic", () => {
			expect(isCharMatch("a", "\u017E")).toBe(false); // a vs ž
			expect(isCharMatch("z", "\u00E9")).toBe(false); // z vs é
		});

		it("handles empty strings", () => {
			expect(isCharMatch("", "")).toBe(true);
			expect(isCharMatch("", "a")).toBe(false);
			expect(isCharMatch("a", "")).toBe(false);
		});
	});
});
