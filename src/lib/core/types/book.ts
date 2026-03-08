/** Book metadata parsed from Standard Ebooks */
export interface BookMeta {
	/** SE URL path: "f-scott-fitzgerald/the-great-gatsby" */
	id: string;
	title: string;
	author: string;
	description: string;
	language: string;
	wordCount: number;
	/** Thumbnail cover URL */
	coverUrl: string;
	/** Full-size cover URL */
	coverHeroUrl: string;
	/** Chapter filenames: ["chapter-1", "chapter-2", ...] */
	chapters: string[];
	datePublished: string;
	dateModified: string;
}

/** Extracted chapter content */
export interface BookChapter {
	index: number;
	title: string;
	/** Clean plain text, normalized for typing */
	text: string;
	wordCount: number;
}

/** Full book with all chapters (stored in IndexedDB cache) */
export interface CachedBook {
	/** Matches BookMeta.id */
	bookId: string;
	meta: BookMeta;
	chapters: BookChapter[];
	cachedAt: number;
}

/** User's reading progress for a book */
export interface BookProgress {
	id?: number;
	/** Matches BookMeta.id (unique index) */
	bookId: string;
	/** Current chapter (0-based) */
	chapterIndex: number;
	/** Word position within current chapter */
	wordOffset: number;
	/** Chapters fully typed through */
	completedChapters: number[];
	/** Cumulative characters typed across all sessions */
	totalCharsTyped: number;
	/** Cumulative typing time in ms */
	totalTimeMs: number;
	/** Running average WPM */
	averageWpm: number;
	/** Number of sessions */
	sessionCount: number;
	lastAccessedAt: number;
	startedAt: number;
	/** Cached book metadata for offline display */
	bookMeta: BookMeta;
}
