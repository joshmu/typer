import { describe, expect, it } from "vitest";
import { characterClass } from "./character-class";

describe("characterClass", () => {
	describe("correct characters", () => {
		it("returns text-correct with no mistakes", () => {
			expect(characterClass("correct", 0)).toBe("text-correct");
		});

		it("returns error-tinted correct for 1-2 prior mistakes", () => {
			expect(characterClass("correct", 1)).toBe("text-correct-tint");
			expect(characterClass("correct", 2)).toBe("text-correct-tint");
		});

		it("returns heavier error-tinted correct for 3+ prior mistakes", () => {
			expect(characterClass("correct", 3)).toBe("text-correct-tint-heavy");
			expect(characterClass("correct", 5)).toBe("text-correct-tint-heavy");
		});
	});

	describe("incorrect characters — progressive scale", () => {
		it("returns tier 1 error for first mistake", () => {
			expect(characterClass("incorrect", 1)).toBe("text-error-1");
		});

		it("returns tier 2 error for second mistake", () => {
			expect(characterClass("incorrect", 2)).toBe("text-error-2");
		});

		it("returns tier 3 error for 3-4 mistakes", () => {
			expect(characterClass("incorrect", 3)).toBe("text-error-3");
			expect(characterClass("incorrect", 4)).toBe("text-error-3");
		});

		it("returns full error for 5+ mistakes (auto-advance threshold)", () => {
			expect(characterClass("incorrect", 5)).toBe("text-error");
		});

		it("returns tier 1 for mistakeCount 0 edge case", () => {
			expect(characterClass("incorrect", 0)).toBe("text-error-1");
		});
	});

	describe("other statuses", () => {
		it("returns text-error-extra for extra characters", () => {
			expect(characterClass("extra", 0)).toBe("text-error-extra");
		});

		it("returns dimmed error for missed characters", () => {
			expect(characterClass("missed", 0)).toBe("text-error opacity-50");
		});

		it("returns text-text-sub for pending characters", () => {
			expect(characterClass("pending", 0)).toBe("text-text-sub");
		});
	});
});
