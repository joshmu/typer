import { openBookReader } from "./core/engine/book-reader";
import type { BookProgress, CachedBook } from "./core/types/book";
import { db, type TyperDB } from "./db";
import { safeFrom } from "./safe-query";

/**
 * Reactive query: get all book progress records, sorted by last accessed.
 */
export function useAllBookProgress() {
	return safeFrom<BookProgress[]>(
		() => db.bookProgress.orderBy("lastAccessedAt").reverse().toArray(),
		[],
	);
}

/**
 * Book percent per bookId, from a reader opened on each cached book.
 * Books whose text is not cached are left out.
 */
export async function loadBookPercents(
	database: TyperDB = db,
): Promise<Record<string, number>> {
	const progress = await database.bookProgress.toArray();
	const books = await database.cachedBooks.bulkGet(
		progress.map((p) => p.bookId),
	);
	const percents: Record<string, number> = {};
	progress.forEach((p, i) => {
		const book = books[i];
		if (book) percents[p.bookId] = openBookReader(book, p).percent;
	});
	return percents;
}

/**
 * Reactive query: book percent per bookId.
 */
export function useBookPercents() {
	return safeFrom<Record<string, number>>(() => loadBookPercents(), {});
}

/** A cached, unfinished book and where its reader stands. */
export interface ResumableBook {
	book: CachedBook;
	/** Absent for a book picked but not typed yet. */
	progress?: BookProgress;
	chapterIndex: number;
	chapterTitle: string;
	percent: number;
}

/**
 * The book to resume: the given one if its text is cached, otherwise the most
 * recently read book that is cached and unfinished. Never touches the network.
 */
export async function loadResumableBook(
	preferredId?: string,
	database: TyperDB = db,
): Promise<ResumableBook | null> {
	const recent = await database.bookProgress
		.orderBy("lastAccessedAt")
		.reverse()
		.toArray();
	const ids = recent.map((p) => p.bookId);
	if (preferredId) ids.unshift(preferredId);

	for (const bookId of new Set(ids)) {
		const book = await database.cachedBooks.get(bookId);
		if (!book) continue;
		const progress = recent.find((p) => p.bookId === bookId);
		const reader = openBookReader(book, progress ?? null);
		if (reader.finished) continue;
		return {
			book,
			progress,
			chapterIndex: reader.position.chapterIndex,
			chapterTitle: reader.chapterTitle,
			percent: reader.percent,
		};
	}
	return null;
}

/**
 * Reactive query: the book to resume (the given one first), wrapped so
 * "none" (null) is distinct from "not read yet" (undefined).
 */
export function useResumableBook(preferredId?: string) {
	return safeFrom<{ book: ResumableBook | null } | undefined>(
		async () => ({ book: await loadResumableBook(preferredId) }),
		undefined,
	);
}

/**
 * Mean WPM over the most recent typing results, or null with no history.
 */
export async function loadAverageWpm(
	database: TyperDB = db,
	limit = 50,
): Promise<number | null> {
	const recent = await database.results
		.orderBy("timestamp")
		.reverse()
		.limit(limit)
		.toArray();
	const wpms = recent.map((r) => r.wpm).filter((wpm) => wpm > 0);
	if (wpms.length === 0) return null;
	return wpms.reduce((sum, wpm) => sum + wpm, 0) / wpms.length;
}

/**
 * Reactive query: recent average WPM, null with no history.
 */
export function useAverageWpm() {
	return safeFrom<number | null>(() => loadAverageWpm(), null);
}
