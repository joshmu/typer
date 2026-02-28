import Dexie, { type Table } from "dexie";

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
}

export class TyperDB extends Dexie {
	results!: Table<TypingResult, number>;

	constructor(name = "TyperDB") {
		super(name);

		this.version(1).stores({
			results: "++id, timestamp, mode, [mode+wpm]",
		});
	}
}

export const db = new TyperDB();
