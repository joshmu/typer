import type { Feed, TestMode } from "../types";
import type { BookProgress, CachedBook } from "../types/book";
import { type BookReader, openBookReader } from "./book-reader";
import type { TestResult } from "./complete-test";

export interface SessionState {
	mode: TestMode;
	text: string | null;
	result: TestResult | null;
	activeBook: CachedBook | null;
	bookReader: BookReader | null;
	/** Source the current test refills from. */
	feed: Feed | null;
	currentBookProgress: BookProgress | null;
	bookLoading: boolean;
}

export function createInitialSession(mode: TestMode): SessionState {
	return {
		mode,
		text: null,
		result: null,
		activeBook: null,
		bookReader: null,
		feed: null,
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
	const reader = openBookReader(book, progress);
	const feed = reader.cursor();
	const text = feed.next(wordCount) || null;
	return {
		...session,
		mode: {
			type: "book",
			bookId: book.bookId,
			chapterIndex: reader.position.chapterIndex,
		},
		text,
		result: null,
		activeBook: book,
		bookReader: reader,
		feed,
		currentBookProgress: progress,
		bookLoading: false,
	};
}

export function applyResult(
	session: SessionState,
	result: TestResult,
	bookProgress?: BookProgress | null,
): SessionState {
	const next = { ...session, result };
	if (bookProgress === undefined) return next;
	next.currentBookProgress = bookProgress;
	if (session.activeBook) {
		next.bookReader = openBookReader(session.activeBook, bookProgress);
		next.feed = null;
	}
	return next;
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
		const reader = session.bookReader;
		if (session.activeBook && reader && !reader.finished) {
			const feed = reader.cursor();
			const nextText = feed.next(bookWordCount);
			if (nextText) {
				return {
					kind: "book-continue",
					state: { ...cleared, text: nextText, feed },
				};
			}
		}
		return {
			kind: "book-finished",
			state: {
				...cleared,
				text: null,
				activeBook: null,
				bookReader: null,
				feed: null,
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
