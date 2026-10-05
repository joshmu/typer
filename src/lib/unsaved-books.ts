import type { CachedBook } from "./core/types/book";

/** Books fetched this session that IndexedDB failed to store. */
const unsaved = new Map<string, CachedBook>();

/** Keeps a fetched book in memory when caching it failed, so it still opens. */
export function keepUnsavedBook(book: CachedBook): void {
	unsaved.set(book.bookId, book);
}

export function forgetUnsavedBook(bookId: string): void {
	unsaved.delete(bookId);
}

export function getUnsavedBook(bookId: string): CachedBook | undefined {
	return unsaved.get(bookId);
}
