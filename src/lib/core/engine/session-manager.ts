import type { TestMode } from "../types";
import type { BookProgress, CachedBook } from "../types/book";
import { type BookFeeder, createBookFeeder } from "./book-feeder";
import type { TestResult } from "./complete-test";

export interface SessionState {
	mode: TestMode;
	text: string | null;
	result: TestResult | null;
	activeBook: CachedBook | null;
	bookFeeder: BookFeeder | null;
	currentBookProgress: BookProgress | null;
	bookLoading: boolean;
}

export function createInitialSession(mode: TestMode): SessionState {
	return {
		mode,
		text: null,
		result: null,
		activeBook: null,
		bookFeeder: null,
		currentBookProgress: null,
		bookLoading: false,
	};
}

export function applyText(
	session: SessionState,
	text: string | null,
): SessionState {
	return { ...session, text, result: null };
}

export function applyBookSelection(
	session: SessionState,
	book: CachedBook,
	progress: BookProgress | null,
	wordCount: number,
): SessionState {
	const startChapter = progress?.chapterIndex ?? 0;
	const startWordOffset = progress?.wordOffset ?? 0;
	const feeder = createBookFeeder(book.chapters, startChapter, startWordOffset);
	const text = feeder.getNextWords(wordCount) || null;
	return {
		...session,
		mode: {
			type: "book",
			bookId: book.bookId,
			chapterIndex: startChapter,
		},
		text,
		result: null,
		activeBook: book,
		bookFeeder: feeder,
		currentBookProgress: progress,
		bookLoading: false,
	};
}

export function applyResult(
	session: SessionState,
	result: TestResult,
	bookProgress?: BookProgress | null,
): SessionState {
	return {
		...session,
		result,
		currentBookProgress:
			bookProgress !== undefined ? bookProgress : session.currentBookProgress,
	};
}

export type RedoOutcome =
	| { kind: "book-continue"; state: SessionState }
	| { kind: "book-finished"; state: SessionState }
	| { kind: "clear-text"; state: SessionState }
	| { kind: "restart-mode"; state: SessionState; mode: TestMode };

/**
 * Decide what should happen when the user clicks Redo. The composable layer
 * is expected to handle async refetches when the outcome is "restart-mode".
 */
export function decideRedo(
	session: SessionState,
	bookWordCount: number,
): RedoOutcome {
	const cleared: SessionState = { ...session, result: null };

	if (session.mode.type === "book") {
		const book = session.activeBook;
		const feeder = session.bookFeeder;
		if (book && feeder && !feeder.isComplete) {
			const nextText = feeder.getNextWords(bookWordCount);
			if (nextText) {
				return {
					kind: "book-continue",
					state: { ...cleared, text: nextText },
				};
			}
		}
		return {
			kind: "book-finished",
			state: {
				...cleared,
				text: null,
				activeBook: null,
				bookFeeder: null,
			},
		};
	}

	if (session.mode.type === "custom") {
		return {
			kind: "clear-text",
			state: { ...cleared, text: null },
		};
	}

	return {
		kind: "restart-mode",
		state: { ...cleared, text: null },
		mode: session.mode,
	};
}
