import {
	type CharBreakdown,
	calculateAccuracy,
	calculateCharBreakdown,
	calculateConsistency,
	calculateRawWPM,
	calculateWPM,
	collectPerSecondWPM,
} from "../calc";
import type { TypingState } from "../types";
import type { BookProgress, CachedBook } from "../types/book";
import { computeBookResumePosition, countCompletedWords } from "./book-resume";

export interface TestResult {
	wpm: number;
	rawWpm: number;
	accuracy: number;
	consistency: number;
	breakdown: CharBreakdown;
	elapsed: number;
	wpmPerSecond: number[];
}

export interface CompletedTestPayload {
	result: TestResult;
	charCount: number;
	errorCount: number;
}

export function completeTest(state: TypingState): CompletedTestPayload {
	const chars = state.words.flatMap((w) => w.characters);
	const elapsed =
		state.startTime && state.endTime ? state.endTime - state.startTime : 0;

	const wpm = calculateWPM(chars, elapsed);
	const rawWpm = calculateRawWPM(chars, elapsed);
	const accuracy = calculateAccuracy(chars);
	const wpmPerSecond = collectPerSecondWPM(chars, state.startTime ?? 0);
	const consistency = calculateConsistency(wpmPerSecond);
	const breakdown = calculateCharBreakdown(chars);

	return {
		result: {
			wpm,
			rawWpm,
			accuracy,
			consistency,
			breakdown,
			elapsed,
			wpmPerSecond,
		},
		charCount: breakdown.total,
		errorCount: breakdown.incorrect + breakdown.extra,
	};
}

export interface NextBookProgressArgs {
	book: CachedBook;
	state: TypingState;
	prev: BookProgress | null;
	result: TestResult;
	charCount: number;
	now: number;
}

export function computeNextBookProgress(
	args: NextBookProgressArgs,
): Omit<BookProgress, "id"> {
	const { book, state, prev, result, charCount, now } = args;
	const wordsTyped = countCompletedWords(state);
	const startCh = prev?.chapterIndex ?? 0;
	const startOff = prev?.wordOffset ?? 0;
	const resume = computeBookResumePosition(
		book.chapters,
		startCh,
		startOff,
		wordsTyped,
	);

	const completedChapters = [...(prev?.completedChapters ?? [])];
	for (let i = 0; i < resume.chapterIndex; i++) {
		if (!completedChapters.includes(i)) completedChapters.push(i);
	}

	const averageWpm = prev
		? Math.round(
				(prev.averageWpm * prev.sessionCount + result.wpm) /
					(prev.sessionCount + 1),
			)
		: result.wpm;

	return {
		bookId: book.bookId,
		chapterIndex: resume.chapterIndex,
		wordOffset: resume.wordOffset,
		completedChapters,
		totalCharsTyped: (prev?.totalCharsTyped ?? 0) + charCount,
		totalTimeMs: (prev?.totalTimeMs ?? 0) + result.elapsed,
		averageWpm,
		sessionCount: (prev?.sessionCount ?? 0) + 1,
		lastAccessedAt: now,
		startedAt: prev?.startedAt ?? now,
		bookMeta: book.meta,
	};
}
