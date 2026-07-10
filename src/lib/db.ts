import Dexie, { type Table } from "dexie";
import type { BookProgress, CachedBook } from "./core/types/book";
import { DatabaseError } from "./core/types/errors";

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

		// v3: plain wpm index — usePersonalBest() orders by wpm across modes,
		// which the compound [mode+wpm] index cannot serve.
		this.version(3).stores({
			results: "++id, timestamp, mode, wpm, [mode+wpm]",
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
	console.error(new DatabaseError("TyperDB failed to open", { cause: err }));
	try {
		await Dexie.delete("TyperDB");
		window.location.reload();
	} catch (deleteErr) {
		console.error(
			new DatabaseError("Failed to recover TyperDB", { cause: deleteErr }),
		);
	}
});
