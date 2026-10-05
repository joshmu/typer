import {
	parseBookDetail,
	parseCatalogPage,
	parseChapterList,
} from "./core/text/se-catalog-parser";
import {
	extractChapterTitle,
	extractTextFromXHTML,
} from "./core/text/xhtml-extractor";
import type { BookChapter, BookMeta, CachedBook } from "./core/types/book";
import {
	BookCacheError,
	BookNotFoundError,
	BookServiceError,
	NetworkError,
} from "./core/types/errors";
import { db } from "./db";

const SE_BASE = "https://standardebooks.org";

interface FetchOptions {
	/** Operation label, used in thrown error messages */
	operation: string;
	/** When set, a 404 throws BookNotFoundError instead of BookServiceError */
	bookId?: string;
}

async function safeFetch(
	url: string,
	options: FetchOptions,
): Promise<Response> {
	let response: Response;
	try {
		response = await fetch(url);
	} catch (err) {
		throw new NetworkError(`Failed to reach ${options.operation}`, {
			cause: err,
		});
	}
	if (!response.ok) {
		if (response.status === 404 && options.bookId) {
			throw new BookNotFoundError(options.bookId);
		}
		throw new BookServiceError(options.operation, response.status);
	}
	return response;
}

/**
 * Search Standard Ebooks catalog by query.
 */
export async function searchBooks(
	query: string,
	page = 1,
): Promise<BookMeta[]> {
	const params = new URLSearchParams({
		query,
		"per-page": "48",
		page: String(page),
	});
	const url = `${SE_BASE}/ebooks?${params}`;
	const response = await safeFetch(url, { operation: "search catalog" });
	const xhtml = await response.text();
	return parseCatalogPage(xhtml);
}

/**
 * Browse the Standard Ebooks catalog (paginated, no search query).
 */
export async function browseCatalog(page = 1): Promise<BookMeta[]> {
	return searchBooks("", page);
}

/**
 * Fetch full book metadata from the book detail page.
 */
export async function fetchBookDetail(bookId: string): Promise<BookMeta> {
	const url = `${SE_BASE}/ebooks/${bookId}`;
	const response = await safeFetch(url, {
		operation: "fetch book detail",
		bookId,
	});
	const xhtml = await response.text();
	const meta = parseBookDetail(xhtml, bookId);

	const tocUrl = `${SE_BASE}/ebooks/${bookId}/text`;
	try {
		const tocResponse = await safeFetch(tocUrl, {
			operation: "fetch chapter list",
			bookId,
		});
		const tocXhtml = await tocResponse.text();
		meta.chapters = parseChapterList(tocXhtml);
	} catch (err) {
		// Chapter list is optional metadata; preserve previous behaviour of
		// silently dropping it on failure rather than failing the whole detail
		// fetch. Only NetworkError / 5xx are absorbed; missing books surface.
		if (err instanceof BookNotFoundError) throw err;
	}

	return meta;
}

const detailLoads = new Map<string, Promise<BookMeta>>();

/**
 * Full metadata for one book: the cached copy when the book is cached,
 * otherwise one fetch per session. A failed load is forgotten so it can retry.
 */
export function loadBookDetail(bookId: string): Promise<BookMeta> {
	const pending = detailLoads.get(bookId);
	if (pending) return pending;
	const load = (async () => {
		const cached = await getCachedBook(bookId);
		return cached ? cached.meta : fetchBookDetail(bookId);
	})();
	detailLoads.set(bookId, load);
	load.catch(() => detailLoads.delete(bookId));
	return load;
}

/**
 * Fetch and parse a single chapter from Standard Ebooks.
 */
export async function fetchChapter(
	bookId: string,
	chapterFile: string,
	chapterIndex: number,
): Promise<BookChapter> {
	const url = `${SE_BASE}/ebooks/${bookId}/text/${chapterFile}`;
	const response = await safeFetch(url, {
		operation: "fetch chapter",
		bookId,
	});
	const xhtml = await response.text();

	const text = extractTextFromXHTML(xhtml);
	const title = extractChapterTitle(xhtml);
	const wordCount = text.split(/\s+/).filter(Boolean).length;

	return { index: chapterIndex, title, text, wordCount };
}

/**
 * Fetch all chapters of a book and cache in IndexedDB.
 */
export async function fetchAndCacheBook(bookId: string): Promise<CachedBook> {
	const cached = await getCachedBook(bookId);
	if (cached) return cached;

	const meta = await fetchBookDetail(bookId);

	const chapters = await Promise.all(
		meta.chapters.map((file, index) => fetchChapter(bookId, file, index)),
	);

	const cachedBook: CachedBook = {
		bookId,
		meta,
		chapters,
		cachedAt: Date.now(),
	};

	try {
		await db.cachedBooks.put(cachedBook);
	} catch (err) {
		// Caching is non-fatal: surface a typed error to log handlers but still
		// return the freshly fetched book.
		console.error(
			new BookCacheError(`Failed to cache book ${bookId}`, { cause: err }),
		);
	}

	return cachedBook;
}

/**
 * Get a cached book from IndexedDB.
 */
export async function getCachedBook(
	bookId: string,
): Promise<CachedBook | null> {
	try {
		const cached = await db.cachedBooks.get(bookId);
		return cached ?? null;
	} catch (err) {
		console.error(
			new BookCacheError(`Failed to read cached book ${bookId}`, {
				cause: err,
			}),
		);
		return null;
	}
}
