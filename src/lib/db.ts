import Dexie, { type Table } from "dexie";
import type { BookProgress, CachedBook } from "./core/types/book";

export interface TypingResult {
	id?: number;
	mode: string;
	wpm: number;
	rawWpm: number;
	accuracy: number;
	consistency: number;
	duration: number;
	charCount: number;
	errorCount: number;
	timestamp: number;
	textHash: string;
	bookTitle?: string;
}

export class TyperDB extends Dexie {
	results!: Table<TypingResult, number>;
	bookProgress!: Table<BookProgress, number>;
	cachedBooks!: Table<CachedBook, string>;

	constructor(name = "TyperDB") {
		super(name);

		this.version(1).stores({
			results: "++id, timestamp, mode, [mode+wpm]",
		});

		this.version(2).stores({
			results: "++id, timestamp, mode, [mode+wpm]",
			bookProgress: "++id, &bookId, lastAccessedAt",
			cachedBooks: "&bookId, cachedAt",
		});
	}
}

export const db = new TyperDB();

// Warn if another tab blocks the upgrade
db.on("blocked", () => {
	console.warn(
		"TyperDB upgrade blocked by another tab. Close other tabs and reload.",
	);
});

// Attempt to open with error recovery — delete corrupted DB and reload
db.open().catch(async (err) => {
	console.error("TyperDB failed to open:", err);
	try {
		await Dexie.delete("TyperDB");
		window.location.reload();
	} catch (deleteErr) {
		console.error("Failed to recover TyperDB:", deleteErr);
	}
});
