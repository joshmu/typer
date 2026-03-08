import { from } from "solid-js";
import { liveQuery } from "dexie";
import type { BookProgress } from "./core/types/book";
import { db } from "./db";

/**
 * Reactive query: get progress for a specific book.
 */
export function useBookProgress(bookId: () => string) {
	return from<BookProgress | undefined>(
		liveQuery(() =>
			db.bookProgress.where("bookId").equals(bookId()).first(),
		),
	);
}

/**
 * Reactive query: get all book progress records, sorted by last accessed.
 */
export function useAllBookProgress() {
	return from<BookProgress[]>(
		liveQuery(() =>
			db.bookProgress.orderBy("lastAccessedAt").reverse().toArray(),
		),
	);
}

/**
 * Save or update reading progress for a book.
 * Upserts by bookId (unique index).
 */
export async function saveBookProgress(
	progress: Omit<BookProgress, "id">,
): Promise<void> {
	const existing = await db.bookProgress
		.where("bookId")
		.equals(progress.bookId)
		.first();

	if (existing?.id) {
		await db.bookProgress.update(existing.id, progress);
	} else {
		await db.bookProgress.add(progress as BookProgress);
	}
}

/**
 * Delete progress and cached book data for a book.
 */
export async function deleteBook(bookId: string): Promise<void> {
	await db.bookProgress.where("bookId").equals(bookId).delete();
	await db.cachedBooks.where("bookId").equals(bookId).delete();
}
