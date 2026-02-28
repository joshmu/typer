import { describe, expect, it } from "vitest";
import { generateWords, truncateToWordCount } from "./words";

describe("generateWords", () => {
	it("generates the requested number of words", () => {
		const result = generateWords(25);
		expect(result.split(" ")).toHaveLength(25);
	});

	it("generates different text each time", () => {
		const a = generateWords(50);
		const b = generateWords(50);
		expect(a).not.toBe(b);
	});

	it("does not repeat consecutive words", () => {
		const words = generateWords(100).split(" ");
		for (let i = 1; i < words.length; i++) {
			expect(words[i].toLowerCase()).not.toBe(words[i - 1].toLowerCase());
		}
	});

	it("adds punctuation when enabled", () => {
		// Generate enough words that punctuation is statistically likely
		const result = generateWords(200, { punctuation: true });
		expect(result).toMatch(/[.,?]/);
	});

	it("adds numbers when enabled", () => {
		const result = generateWords(200, { numbers: true });
		expect(result).toMatch(/\d/);
	});

	it("capitalizes after periods with punctuation", () => {
		// Generate many words to get at least one period
		let found = false;
		for (let attempt = 0; attempt < 10; attempt++) {
			const result = generateWords(200, { punctuation: true });
			const words = result.split(" ");
			for (let i = 1; i < words.length; i++) {
				if (words[i - 1].endsWith(".")) {
					expect(words[i][0]).toBe(words[i][0].toUpperCase());
					found = true;
				}
			}
			if (found) break;
		}
	});
});

describe("truncateToWordCount", () => {
	it("truncates to the specified word count", () => {
		const result = truncateToWordCount("the quick brown fox jumps", 3);
		expect(result).toBe("the quick brown");
	});

	it("returns full text if under limit", () => {
		const result = truncateToWordCount("hello world", 5);
		expect(result).toBe("hello world");
	});

	it("handles single word", () => {
		const result = truncateToWordCount("hello", 1);
		expect(result).toBe("hello");
	});
});
