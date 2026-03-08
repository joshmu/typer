import { describe, expect, it } from "vitest";
import type { BookChapter } from "../types/book";
import { createBookFeeder } from "./book-feeder";

function makeChapter(
	index: number,
	text: string,
	title = `Chapter ${index + 1}`,
): BookChapter {
	return {
		index,
		title,
		text,
		wordCount: text.split(/\s+/).length,
	};
}

const chapters: BookChapter[] = [
	makeChapter(0, "The quick brown fox jumps over the lazy dog."),
	makeChapter(1, "A second chapter with some different words here."),
	makeChapter(2, "Third and final chapter of the book ends here nicely."),
];

describe("createBookFeeder", () => {
	it("feeds words sequentially from the first chapter", () => {
		const feeder = createBookFeeder(chapters, 0, 0);
		const words = feeder.getNextWords(3);

		expect(words).toBe("The quick brown");
	});

	it("tracks current chapter and word offset", () => {
		const feeder = createBookFeeder(chapters, 0, 0);
		feeder.getNextWords(3);

		expect(feeder.currentChapter).toBe(0);
		expect(feeder.currentWordOffset).toBe(3);
	});

	it("feeds more words from the same chapter", () => {
		const feeder = createBookFeeder(chapters, 0, 0);
		feeder.getNextWords(3);
		const more = feeder.getNextWords(3);

		expect(more).toBe("fox jumps over");
	});

	it("crosses chapter boundary when current chapter runs out", () => {
		const feeder = createBookFeeder(chapters, 0, 0);
		// Chapter 0 has 9 words, request all of them plus more
		feeder.getNextWords(9); // exhaust chapter 0
		const nextWords = feeder.getNextWords(3);

		expect(nextWords).toBe("A second chapter");
		expect(feeder.currentChapter).toBe(1);
		expect(feeder.crossedChapterBoundary).toBe(true);
	});

	it("provides the new chapter title when crossing boundary", () => {
		const feeder = createBookFeeder(chapters, 0, 0);
		feeder.getNextWords(9); // exhaust chapter 0
		feeder.getNextWords(1); // cross into chapter 1

		expect(feeder.newChapterTitle).toBe("Chapter 2");
	});

	it("resets crossedChapterBoundary after the next call", () => {
		const feeder = createBookFeeder(chapters, 0, 0);
		feeder.getNextWords(9);
		feeder.getNextWords(1); // cross
		expect(feeder.crossedChapterBoundary).toBe(true);

		feeder.getNextWords(1); // should reset
		expect(feeder.crossedChapterBoundary).toBe(false);
		expect(feeder.newChapterTitle).toBeNull();
	});

	it("resumes from a specific chapter and word offset", () => {
		const feeder = createBookFeeder(chapters, 1, 3);
		const words = feeder.getNextWords(3);

		// Chapter 1: "A second chapter with some different words here."
		// Offset 3 = "with"
		expect(words).toBe("with some different");
		expect(feeder.currentChapter).toBe(1);
	});

	it("reports isComplete when all chapters are exhausted", () => {
		const feeder = createBookFeeder(chapters, 2, 0);
		expect(feeder.isComplete).toBe(false);

		// Chapter 2 has 10 words
		feeder.getNextWords(20); // request more than available
		expect(feeder.isComplete).toBe(true);
	});

	it("returns remaining words when fewer are available", () => {
		const feeder = createBookFeeder(chapters, 2, 7);
		// Chapter 2: "Third and final chapter of the book ends here nicely."
		// Offset 7 = "ends", remaining: "ends here nicely."
		const words = feeder.getNextWords(10);

		expect(words).toBe("ends here nicely.");
		expect(feeder.isComplete).toBe(true);
	});

	it("returns empty string when already complete", () => {
		const feeder = createBookFeeder(chapters, 2, 0);
		feeder.getNextWords(100); // exhaust everything
		const words = feeder.getNextWords(5);

		expect(words).toBe("");
	});

	it("tracks total word offset across chapters", () => {
		const feeder = createBookFeeder(chapters, 0, 0);
		feeder.getNextWords(9); // all of chapter 0
		feeder.getNextWords(5); // 5 from chapter 1

		expect(feeder.totalWordOffset).toBe(14);
	});

	it("handles empty chapters gracefully", () => {
		const chaptersWithEmpty: BookChapter[] = [
			makeChapter(0, "First chapter."),
			makeChapter(1, ""),
			makeChapter(2, "Third chapter."),
		];

		const feeder = createBookFeeder(chaptersWithEmpty, 0, 0);
		feeder.getNextWords(2); // exhaust chapter 0
		const words = feeder.getNextWords(2); // should skip empty chapter 1

		expect(words).toBe("Third chapter.");
		expect(feeder.currentChapter).toBe(2);
	});

	it("handles single chapter book", () => {
		const single: BookChapter[] = [makeChapter(0, "Just one chapter here.")];
		const feeder = createBookFeeder(single, 0, 0);

		expect(feeder.getNextWords(2)).toBe("Just one");
		expect(feeder.getNextWords(2)).toBe("chapter here.");
		expect(feeder.isComplete).toBe(true);
	});
});
