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
import { db } from "./db";

const SE_BASE = "https://standardebooks.org";

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
	const response = await fetch(url);
	if (!response.ok)
		throw new Error(`Failed to fetch catalog: ${response.status}`);
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
	const response = await fetch(url);
	if (!response.ok)
		throw new Error(`Failed to fetch book detail: ${response.status}`);
	const xhtml = await response.text();
	const meta = parseBookDetail(xhtml, bookId);

	// Also fetch chapter list
	const tocUrl = `${SE_BASE}/ebooks/${bookId}/text`;
	const tocResponse = await fetch(tocUrl);
	if (tocResponse.ok) {
		const tocXhtml = await tocResponse.text();
		meta.chapters = parseChapterList(tocXhtml);
	}

	return meta;
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
	const response = await fetch(url);
	if (!response.ok)
		throw new Error(`Failed to fetch chapter: ${response.status}`);
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
	// Check cache first
	const cached = await getCachedBook(bookId);
	if (cached) return cached;

	// Fetch metadata with chapters
	const meta = await fetchBookDetail(bookId);

	// Fetch all chapters in parallel
	const chapters = await Promise.all(
		meta.chapters.map((file, index) => fetchChapter(bookId, file, index)),
	);

	const cachedBook: CachedBook = {
		bookId,
		meta,
		chapters,
		cachedAt: Date.now(),
	};

	// Save to IndexedDB (non-fatal if cache fails)
	try {
		await db.cachedBooks.put(cachedBook);
	} catch (err) {
		console.error("Failed to cache book:", err);
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
		console.error("Failed to read cached book:", err);
		return null;
	}
}

/**
 * Check if a book is cached in IndexedDB.
 */
export async function isBookCached(bookId: string): Promise<boolean> {
	try {
		const count = await db.cachedBooks.where("bookId").equals(bookId).count();
		return count > 0;
	} catch {
		return false;
	}
}

/**
 * Delete a cached book from IndexedDB.
 */
export async function deleteCachedBook(bookId: string): Promise<void> {
	try {
		await db.cachedBooks.where("bookId").equals(bookId).delete();
	} catch (err) {
		console.error("Failed to delete cached book:", err);
	}
}
