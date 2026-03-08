import type { BookChapter } from "../types/book";
import type { TypingState } from "../types";
import { createBookFeeder } from "./book-feeder";

export interface ResumePosition {
	chapterIndex: number;
	wordOffset: number;
}

/**
 * Count the number of words the user fully completed in a typing session.
 * A word is "completed" once the cursor has advanced past it.
 */
export function countCompletedWords(state: TypingState): number {
	return state.currentWordIndex;
}

/**
 * Compute the correct book resume position based on actual typing progress.
 *
 * The book feeder pre-fetches words ahead of the user's typing position.
 * This function calculates where the user actually stopped typing by
 * creating a temporary feeder and advancing it by exactly the number
 * of words the user completed. Handles chapter boundaries naturally.
 */
export function computeBookResumePosition(
	chapters: BookChapter[],
	startChapter: number,
	startWordOffset: number,
	completedWords: number,
): ResumePosition {
	if (completedWords === 0) {
		return { chapterIndex: startChapter, wordOffset: startWordOffset };
	}

	const feeder = createBookFeeder(chapters, startChapter, startWordOffset);
	feeder.getNextWords(completedWords);

	return {
		chapterIndex: feeder.currentChapter,
		wordOffset: feeder.currentWordOffset,
	};
}
