import { describe, expect, it } from "vitest";
import { characterClass } from "./character-class";

describe("characterClass", () => {
	describe("correct characters", () => {
		it("returns text-correct with no mistakes", () => {
			expect(characterClass("correct", 0)).toBe("text-correct");
		});

		it("keeps the correct colour and marks a corrected character", () => {
			expect(characterClass("correct", 1)).toBe("text-correct char-corrected");
			expect(characterClass("correct", 4)).toBe("text-correct char-corrected");
		});
	});

	describe("incorrect characters", () => {
		it("are solid error however many mistakes they took", () => {
			expect(characterClass("incorrect", 0)).toBe("text-error char-wrong");
			expect(characterClass("incorrect", 1)).toBe("text-error char-wrong");
			expect(characterClass("incorrect", 5)).toBe("text-error char-wrong");
		});
	});

	describe("other statuses", () => {
		it("marks extra characters", () => {
			expect(characterClass("extra", 0)).toBe("text-error char-extra");
		});

		it("returns dimmed error for missed characters", () => {
			expect(characterClass("missed", 0)).toBe("text-error opacity-50");
		});

		it("returns text-text-sub for pending characters", () => {
			expect(characterClass("pending", 0)).toBe("text-text-sub");
		});
	});
});
