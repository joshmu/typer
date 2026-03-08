import type { BookProgress } from "./core/types/book";
import { db } from "./db";
import { safeFrom } from "./safe-query";

/**
 * Reactive query: get progress for a specific book.
 */
export function useBookProgress(bookId: () => string) {
	return safeFrom<BookProgress | undefined>(
		() => db.bookProgress.where("bookId").equals(bookId()).first(),
		undefined,
	);
}

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
 * Save or update reading progress for a book.
 * Upserts by bookId (unique index).
 */
export async function saveBookProgress(
	progress: Omit<BookProgress, "id">,
): Promise<void> {
	try {
		const existing = await db.bookProgress
			.where("bookId")
			.equals(progress.bookId)
			.first();

		if (existing?.id) {
			await db.bookProgress.update(existing.id, progress);
		} else {
			await db.bookProgress.add(progress as BookProgress);
		}
	} catch (err) {
		console.error("Failed to save book progress:", err);
	}
}

/**
 * Delete progress and cached book data for a book.
 */
export async function deleteBook(bookId: string): Promise<void> {
	try {
		await db.bookProgress.where("bookId").equals(bookId).delete();
		await db.cachedBooks.where("bookId").equals(bookId).delete();
	} catch (err) {
		console.error("Failed to delete book:", err);
	}
}
