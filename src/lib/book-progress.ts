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
