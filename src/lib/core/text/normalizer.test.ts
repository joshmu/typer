import { describe, expect, it } from "vitest";
import { normalizeText, textToCharacters, textToWords } from "./normalizer";

describe("normalizeText", () => {
	it("trims leading and trailing whitespace", () => {
		expect(normalizeText("  hello  ")).toBe("hello");
	});

	it("collapses multiple spaces into one", () => {
		expect(normalizeText("hello   world")).toBe("hello world");
	});

	it("replaces tabs with spaces", () => {
		expect(normalizeText("hello\tworld")).toBe("hello world");
	});

	it("collapses newlines into spaces", () => {
		expect(normalizeText("hello\nworld")).toBe("hello world");
	});

	it("handles mixed whitespace", () => {
		expect(normalizeText("hello \t\n  world")).toBe("hello world");
	});

	it("returns empty string for empty input", () => {
		expect(normalizeText("")).toBe("");
	});

	it("returns empty string for whitespace-only input", () => {
		expect(normalizeText("   \t\n  ")).toBe("");
	});

	it("preserves Unicode characters", () => {
		expect(normalizeText("café résumé")).toBe("café résumé");
	});

	it("enforces character limit", () => {
		const long = "a".repeat(2000);
		const result = normalizeText(long, 100);
		expect(result.length).toBeLessThanOrEqual(100);
	});

	it("truncates at word boundary when enforcing limit", () => {
		const result = normalizeText("the quick brown fox jumps", 15);
		expect(result).toBe("the quick brown");
	});

	it("handles single word exceeding limit", () => {
		const result = normalizeText("superlongword", 5);
		expect(result).toBe("super");
	});
});

describe("textToWords", () => {
	it("splits text into WordState array", () => {
		const words = textToWords("the quick");
		expect(words).toHaveLength(2);
		expect(words[0].isActive).toBe(false);
		expect(words[1].isActive).toBe(false);
	});

	it("includes trailing space in non-last words", () => {
		const words = textToWords("the quick fox");
		// "the " has 4 chars (including space)
		expect(words[0].characters).toHaveLength(4);
		expect(words[0].characters[3].expected).toBe(" ");
		// "fox" has no trailing space
		expect(words[2].characters).toHaveLength(3);
	});

	it("returns empty array for empty text", () => {
		expect(textToWords("")).toHaveLength(0);
	});

	it("handles single word", () => {
		const words = textToWords("hello");
		expect(words).toHaveLength(1);
		expect(words[0].characters).toHaveLength(5);
	});
});

describe("textToCharacters", () => {
	it("creates CharacterState for each character", () => {
		const chars = textToCharacters("abc");
		expect(chars).toHaveLength(3);
		expect(chars[0].expected).toBe("a");
		expect(chars[1].expected).toBe("b");
		expect(chars[2].expected).toBe("c");
	});

	it("all characters start as pending", () => {
		const chars = textToCharacters("hi");
		for (const ch of chars) {
			expect(ch.status).toBe("pending");
			expect(ch.typed).toBeNull();
			expect(ch.timestamp).toBeNull();
		}
	});

	it("returns empty array for empty text", () => {
		expect(textToCharacters("")).toHaveLength(0);
	});
});
