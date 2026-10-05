import { openBookReader } from "./core/engine/book-reader";
import type { BookProgress } from "./core/types/book";
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
