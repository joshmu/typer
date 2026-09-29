import type { Feed, TypingState } from "../types";
import type { BookProgress, CachedBook } from "../types/book";
import { createBookFeeder } from "./book-feeder";

export interface BookPosition {
	chapterIndex: number;
	wordOffset: number;
}

/** What one finished test adds to the book's running stats. */
export interface CommitStats {
	charCount: number;
	elapsedMs: number;
	wpm: number;
	now: number;
}

/**
 * A reader's place in a book. Values are fixed at open: `commit` returns the
 * next progress, and the caller opens a new reader from it.
 */
export interface BookReader {
	readonly position: BookPosition;
	/** Committed word offset over the book's total words, 0 to 100. */
	readonly percent: number;
	readonly chapterTitle: string;
	readonly finished: boolean;
	/** A throwaway feed from the committed position. */
	cursor(): Feed;
	commit(wordsTyped: number, stats: CommitStats): Omit<BookProgress, "id">;
}

/** Words the typing cursor has moved past. */
export function countCompletedWords(state: TypingState): number {
	return state.currentWordIndex;
}

function clampPosition(
	book: CachedBook,
	progress: BookProgress | null,
): BookPosition {
	const last = book.chapters.length - 1;
	if (last < 0) return { chapterIndex: 0, wordOffset: 0 };
	const requested = Math.max(0, progress?.chapterIndex ?? 0);
	if (requested > last) {
		return { chapterIndex: last, wordOffset: book.chapters[last].wordCount };
	}
	const words = book.chapters[requested].wordCount;
	const offset = Math.max(0, progress?.wordOffset ?? 0);
	return { chapterIndex: requested, wordOffset: Math.min(offset, words) };
}

export function openBookReader(
	book: CachedBook,
	progress: BookProgress | null,
): BookReader {
	const position = clampPosition(book, progress);
	let before = 0;
	let total = 0;
	book.chapters.forEach((chapter, i) => {
		if (i < position.chapterIndex) before += chapter.wordCount;
		total += chapter.wordCount;
	});
	const offset = before + position.wordOffset;

	function cursor(): Feed {
		const feeder = createBookFeeder(
			book.chapters,
			position.chapterIndex,
			position.wordOffset,
		);
		return {
			next: (count) => feeder.getNextWords(count),
			get exhausted() {
				return feeder.isComplete;
			},
		};
	}

	function commit(
		wordsTyped: number,
		stats: CommitStats,
	): Omit<BookProgress, "id"> {
		let next = position;
		if (wordsTyped > 0) {
			const feeder = createBookFeeder(
				book.chapters,
				position.chapterIndex,
				position.wordOffset,
			);
			feeder.getNextWords(wordsTyped);
			next = {
				chapterIndex: feeder.currentChapter,
				wordOffset: feeder.currentWordOffset,
			};
		}

		const completedChapters = [...(progress?.completedChapters ?? [])];
		for (let i = 0; i < next.chapterIndex; i++) {
			if (!completedChapters.includes(i)) completedChapters.push(i);
		}

		const sessions = progress?.sessionCount ?? 0;
		const averageWpm = progress
			? Math.round(
					(progress.averageWpm * sessions + stats.wpm) / (sessions + 1),
				)
			: stats.wpm;

		return {
			bookId: book.bookId,
			chapterIndex: next.chapterIndex,
			wordOffset: next.wordOffset,
			completedChapters,
			totalCharsTyped: (progress?.totalCharsTyped ?? 0) + stats.charCount,
			totalTimeMs: (progress?.totalTimeMs ?? 0) + stats.elapsedMs,
			averageWpm,
			sessionCount: sessions + 1,
			lastAccessedAt: stats.now,
			startedAt: progress?.startedAt ?? stats.now,
			bookMeta: book.meta,
		};
	}

	return {
		position,
		percent: total > 0 ? Math.floor((offset / total) * 100) : 0,
		chapterTitle: book.chapters[position.chapterIndex]?.title ?? "",
		finished: offset >= total,
		cursor,
		commit,
	};
}
