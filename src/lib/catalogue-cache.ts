import type { BookMeta } from "./core/types/book";

/** localStorage key for the last good first page of the catalogue. */
export const CATALOGUE_KEY = "typer:catalogue:v1";

export interface SavedCatalogue {
	books: BookMeta[];
	/** Epoch ms the copy was fetched. */
	savedAt: number;
}

function defaultStorage(): Storage | null {
	try {
		return globalThis.localStorage ?? null;
	} catch {
		return null;
	}
}

function isBook(value: unknown): value is BookMeta {
	const b = value as BookMeta | null;
	return (
		typeof b === "object" &&
		b !== null &&
		typeof b.id === "string" &&
		typeof b.title === "string" &&
		Array.isArray(b.chapters)
	);
}

/** The last catalogue page saved, or null when there is none or it is unreadable. */
export function readSavedCatalogue(
	storage: Storage | null = defaultStorage(),
): SavedCatalogue | null {
	try {
		const raw = storage?.getItem(CATALOGUE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<SavedCatalogue>;
		if (
			typeof parsed.savedAt !== "number" ||
			!Array.isArray(parsed.books) ||
			parsed.books.length === 0 ||
			!parsed.books.every(isBook)
		) {
			return null;
		}
		return { books: parsed.books, savedAt: parsed.savedAt };
	} catch {
		return null;
	}
}

/** Saves a good catalogue page. An empty page never replaces a saved one. */
export function saveCatalogue(
	books: BookMeta[],
	now = Date.now(),
	storage: Storage | null = defaultStorage(),
): void {
	if (books.length === 0) return;
	try {
		const saved: SavedCatalogue = { books, savedAt: now };
		storage?.setItem(CATALOGUE_KEY, JSON.stringify(saved));
	} catch {
		// Full or blocked storage only costs the next visit its instant grid.
	}
}
