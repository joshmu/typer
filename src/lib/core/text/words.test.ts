import { describe, expect, it } from "vitest";
import { generateWords, truncateToWordCount, zipfWeightedIndex } from "./words";

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

describe("zipfWeightedIndex", () => {
	it("returns index within bounds", () => {
		for (let i = 0; i < 100; i++) {
			const idx = zipfWeightedIndex(1000);
			expect(idx).toBeGreaterThanOrEqual(0);
			expect(idx).toBeLessThan(1000);
		}
	});

	it("biases toward lower indices", () => {
		const counts = { bottom20: 0, rest: 0 };
		const length = 100;
		const runs = 10_000;
		for (let i = 0; i < runs; i++) {
			const idx = zipfWeightedIndex(length);
			if (idx < length * 0.2) counts.bottom20++;
			else counts.rest++;
		}
		// Power law (x^1.5) gives bottom 20% about 34% of picks — well above uniform 20%
		expect(counts.bottom20 / runs).toBeGreaterThan(0.25);
	});
});

describe("generateWords with custom word list", () => {
	it("accepts custom wordList", () => {
		const customList = [
			"alpha",
			"bravo",
			"charlie",
			"delta",
			"echo",
			"foxtrot",
			"golf",
			"hotel",
			"india",
			"juliet",
		];
		const result = generateWords(20, { wordList: customList });
		const words = result.split(" ");
		for (const w of words) {
			expect(customList).toContain(w);
		}
	});

	it("with custom list prevents consecutive repeats", () => {
		const customList = [
			"alpha",
			"bravo",
			"charlie",
			"delta",
			"echo",
			"foxtrot",
			"golf",
			"hotel",
			"india",
			"juliet",
		];
		const result = generateWords(50, { wordList: customList });
		const words = result.split(" ");
		for (let i = 1; i < words.length; i++) {
			expect(words[i]).not.toBe(words[i - 1]);
		}
	});
});

describe("word list data files", () => {
	it("english-1k contains 1000 unique words", async () => {
		const data = (await import("./data/english-1k.json")).default;
		expect(data).toHaveLength(1000);
		expect(new Set(data).size).toBe(1000);
	});

	it("english-5k contains 5000 unique words", async () => {
		const data = (await import("./data/english-5k.json")).default;
		expect(data).toHaveLength(5000);
		expect(new Set(data).size).toBe(5000);
	});

	it("1k list words are all lowercase strings", async () => {
		const data = (await import("./data/english-1k.json")).default;
		for (const word of data) {
			expect(typeof word).toBe("string");
			expect(word).toBe(word.toLowerCase());
			expect(word.trim()).toBe(word);
		}
	});

	it("5k list words are all lowercase strings", async () => {
		const data = (await import("./data/english-5k.json")).default;
		for (const word of data) {
			expect(typeof word).toBe("string");
			expect(word).toBe(word.toLowerCase());
			expect(word.trim()).toBe(word);
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
