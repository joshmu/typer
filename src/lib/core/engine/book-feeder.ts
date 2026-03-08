import type { BookChapter } from "../types/book";

export interface BookFeeder {
	/** Get the next N words from the book as a space-separated string */
	getNextWords(count: number): string;
	/** Current chapter index (0-based) */
	readonly currentChapter: number;
	/** Word offset within the current chapter */
	readonly currentWordOffset: number;
	/** Total words consumed across all chapters */
	readonly totalWordOffset: number;
	/** Whether the entire book has been consumed */
	readonly isComplete: boolean;
	/** Whether the last getNextWords() call crossed a chapter boundary */
	readonly crossedChapterBoundary: boolean;
	/** Chapter title if we just entered a new chapter, null otherwise */
	readonly newChapterTitle: string | null;
}

/**
 * Creates a sequential word feeder that supplies words from book chapters.
 * Used by the typing engine to feed book text in Zen-style continuous mode.
 */
export function createBookFeeder(
	chapters: BookChapter[],
	startChapter: number,
	startWordOffset: number,
): BookFeeder {
	// Pre-split all chapters into word arrays
	const chapterWords = chapters.map((ch) =>
		ch.text.trim() ? ch.text.trim().split(/\s+/) : [],
	);

	let chapterIdx = startChapter;
	let wordIdx = startWordOffset;
	let totalConsumed = 0;
	let _crossedBoundary = false;
	let _newTitle: string | null = null;

	// Calculate initial total offset
	for (let i = 0; i < startChapter; i++) {
		totalConsumed += chapterWords[i].length;
	}
	totalConsumed += startWordOffset;

	function isExhausted(): boolean {
		if (chapterIdx >= chapters.length) return true;
		// Check if we're at the end of the last chapter
		if (
			chapterIdx === chapters.length - 1 &&
			wordIdx >= chapterWords[chapterIdx].length
		)
			return true;
		return false;
	}

	function advanceToNextNonEmptyChapter(): boolean {
		while (chapterIdx < chapters.length) {
			if (
				chapterWords[chapterIdx].length > 0 &&
				wordIdx < chapterWords[chapterIdx].length
			) {
				return true; // found content
			}
			chapterIdx++;
			wordIdx = 0;
		}
		return false; // exhausted all chapters
	}

	function getNextWords(count: number): string {
		_crossedBoundary = false;
		_newTitle = null;

		if (isExhausted()) return "";

		const result: string[] = [];
		let remaining = count;
		const startingChapter = chapterIdx;

		while (remaining > 0) {
			if (!advanceToNextNonEmptyChapter()) break;

			// Track chapter transition
			if (chapterIdx !== startingChapter && result.length === 0) {
				_crossedBoundary = true;
				_newTitle = chapters[chapterIdx].title;
			}

			const words = chapterWords[chapterIdx];
			const available = words.length - wordIdx;
			const take = Math.min(remaining, available);

			result.push(...words.slice(wordIdx, wordIdx + take));
			wordIdx += take;
			totalConsumed += take;
			remaining -= take;

			// If we've exhausted this chapter and need more
			if (wordIdx >= words.length && remaining > 0) {
				chapterIdx++;
				wordIdx = 0;

				if (chapterIdx < chapters.length) {
					_crossedBoundary = true;
					_newTitle = chapters[chapterIdx].title;
				}
			}
		}

		return result.join(" ");
	}

	return {
		getNextWords,
		get currentChapter() {
			return Math.min(chapterIdx, chapters.length - 1);
		},
		get currentWordOffset() {
			return wordIdx;
		},
		get totalWordOffset() {
			return totalConsumed;
		},
		get isComplete() {
			return isExhausted();
		},
		get crossedChapterBoundary() {
			return _crossedBoundary;
		},
		get newChapterTitle() {
			return _newTitle;
		},
	};
}
