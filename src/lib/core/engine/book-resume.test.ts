import { describe, expect, it } from "vitest";
import type { BookChapter } from "../types/book";
import { computeBookResumePosition, countCompletedWords } from "./book-resume";
import { createTypingState } from "../types/test-fixtures";
import { processKeystroke } from "./process-keystroke";

function makeChapter(index: number, wordCount: number): BookChapter {
	const words = Array.from({ length: wordCount }, (_, i) => `word${i}`);
	return {
		index,
		title: `Chapter ${index + 1}`,
		text: words.join(" "),
		wordCount,
	};
}

describe("countCompletedWords", () => {
	it("returns 0 when no words have been typed", () => {
		const state = createTypingState("hello world");
		expect(countCompletedWords(state)).toBe(0);
	});

	it("returns currentWordIndex for partially typed test", () => {
		let state = createTypingState("ab cd ef");
		// Type "ab " to complete first word
		state = processKeystroke(state, "a", 1000);
		state = processKeystroke(state, "b", 1001);
		state = processKeystroke(state, " ", 1002);
		expect(state.currentWordIndex).toBe(1);
		expect(countCompletedWords(state)).toBe(1);
	});

	it("counts multiple completed words", () => {
		let state = createTypingState("ab cd ef");
		// Type "ab cd " to complete two words
		for (const key of ["a", "b", " ", "c", "d", " "]) {
			state = processKeystroke(state, key, Date.now());
		}
		expect(countCompletedWords(state)).toBe(2);
	});
});

describe("computeBookResumePosition", () => {
	it("returns start position when 0 words completed", () => {
		const chapters = [makeChapter(0, 100)];
		const result = computeBookResumePosition(chapters, 0, 0, 0);
		expect(result).toEqual({ chapterIndex: 0, wordOffset: 0 });
	});

	it("returns start position when 0 words completed mid-chapter", () => {
		const chapters = [makeChapter(0, 100)];
		const result = computeBookResumePosition(chapters, 0, 50, 0);
		expect(result).toEqual({ chapterIndex: 0, wordOffset: 50 });
	});

	it("advances within same chapter", () => {
		const chapters = [makeChapter(0, 100)];
		const result = computeBookResumePosition(chapters, 0, 0, 10);
		expect(result).toEqual({ chapterIndex: 0, wordOffset: 10 });
	});

	it("advances from mid-chapter offset", () => {
		const chapters = [makeChapter(0, 100)];
		const result = computeBookResumePosition(chapters, 0, 25, 10);
		expect(result).toEqual({ chapterIndex: 0, wordOffset: 35 });
	});

	it("crosses chapter boundary", () => {
		const chapters = [makeChapter(0, 10), makeChapter(1, 100)];
		// Start at chapter 0, word 5. Complete 10 words (5 remaining in ch0 + 5 into ch1)
		const result = computeBookResumePosition(chapters, 0, 5, 10);
		expect(result).toEqual({ chapterIndex: 1, wordOffset: 5 });
	});

	it("completes entire chapter — resume position at end of chapter", () => {
		const chapters = [makeChapter(0, 10), makeChapter(1, 100)];
		// Complete exactly 10 words (all of chapter 0).
		// Feeder reports (0, 10) — at the end of ch0.
		// This is equivalent to (1, 0): when a new feeder starts at (0, 10),
		// it auto-advances to chapter 1.
		const result = computeBookResumePosition(chapters, 0, 0, 10);
		expect(result).toEqual({ chapterIndex: 0, wordOffset: 10 });
	});

	it("crosses multiple chapters", () => {
		const chapters = [
			makeChapter(0, 5),
			makeChapter(1, 5),
			makeChapter(2, 100),
		];
		// Start at beginning, type 12 words (5 + 5 + 2)
		const result = computeBookResumePosition(chapters, 0, 0, 12);
		expect(result).toEqual({ chapterIndex: 2, wordOffset: 2 });
	});
});
