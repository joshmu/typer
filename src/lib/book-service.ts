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
	/** Defaults to FETCH_TIMEOUT_MS. */
	timeoutMs?: number;
}

/** A request (headers and body) that takes longer than this is abandoned. */
export const FETCH_TIMEOUT_MS = 8000;
/** Chapters download together, so each may queue behind the others. */
const CHAPTER_TIMEOUT_MS = 30_000;

async function fetchText(url: string, options: FetchOptions): Promise<string> {
	const controller = new AbortController();
	const timer = setTimeout(
		() => controller.abort(),
		options.timeoutMs ?? FETCH_TIMEOUT_MS,
	);
	try {
		let response: Response;
		try {
			response = await fetch(url, { signal: controller.signal });
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
		try {
			return await response.text();
		} catch (err) {
			throw new NetworkError(`Failed to read ${options.operation}`, {
				cause: err,
			});
		}
	} finally {
		clearTimeout(timer);
	}
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
	const xhtml = await fetchText(url, { operation: "search catalog" });
	return parseCatalogPage(xhtml);
}

/**
 * Browse the Standard Ebooks catalog (paginated, no search query).
 */
export async function browseCatalog(page = 1): Promise<BookMeta[]> {
	return searchBooks("", page);
}

/**
 * Fetch full book metadata: the detail page and chapter list, in parallel.
 * The chapter list is optional: if it fails (other than a 404), the
 * metadata comes back with no chapters.
 */
export async function fetchBookDetail(bookId: string): Promise<BookMeta> {
	const [detail, toc] = await Promise.allSettled([
		fetchText(`${SE_BASE}/ebooks/${bookId}`, {
			operation: "fetch book detail",
			bookId,
		}),
		fetchText(`${SE_BASE}/ebooks/${bookId}/text`, {
			operation: "fetch chapter list",
			bookId,
		}),
	]);
	if (detail.status === "rejected") throw detail.reason;
	const meta = parseBookDetail(detail.value, bookId);
	if (toc.status === "fulfilled") {
		meta.chapters = parseChapterList(toc.value);
	} else if (toc.reason instanceof BookNotFoundError) {
		throw toc.reason;
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
	// A failed load, or one missing its chapter list, is retried next time.
	load.then(
		(meta) => {
			if (meta.chapters.length === 0) detailLoads.delete(bookId);
		},
		() => detailLoads.delete(bookId),
	);
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
	const xhtml = await fetchText(url, {
		operation: "fetch chapter",
		bookId,
		timeoutMs: CHAPTER_TIMEOUT_MS,
	});

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

	const meta = await loadBookDetail(bookId);
	if (meta.chapters.length === 0) {
		// No chapter list (it failed or timed out): nothing to type, and an
		// empty book must not be cached.
		throw new BookServiceError("fetch chapter list", 0);
	}

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
