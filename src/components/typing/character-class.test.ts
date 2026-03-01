import { describe, expect, it } from "vitest";
import { characterClass } from "./character-class";

describe("characterClass", () => {
	describe("correct characters", () => {
		it("returns text-correct with no mistakes", () => {
			expect(characterClass("correct", 0)).toBe("text-correct");
		});

		it("returns dimmed correct for 1-2 prior mistakes", () => {
			expect(characterClass("correct", 1)).toBe("text-correct opacity-80");
			expect(characterClass("correct", 2)).toBe("text-correct opacity-80");
		});

		it("returns more dimmed correct for 3+ prior mistakes", () => {
			expect(characterClass("correct", 3)).toBe("text-correct opacity-60");
			expect(characterClass("correct", 5)).toBe("text-correct opacity-60");
		});
	});

	describe("incorrect characters", () => {
		it("returns full text-error for first mistake", () => {
			expect(characterClass("incorrect", 1)).toBe("text-error");
		});

		it("returns full text-error for any mistake count", () => {
			expect(characterClass("incorrect", 2)).toBe("text-error");
			expect(characterClass("incorrect", 3)).toBe("text-error");
			expect(characterClass("incorrect", 5)).toBe("text-error");
		});

		it("returns full text-error even for mistakeCount 0", () => {
			// Edge case: shouldn't happen, but be safe
			expect(characterClass("incorrect", 0)).toBe("text-error");
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
