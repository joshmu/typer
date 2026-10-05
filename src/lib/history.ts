import { isAfk } from "./core/calc";
import type { CompletedTestPayload } from "./core/engine/complete-test";
import { simpleHash } from "./core/text/hash";
import type { TypingState } from "./core/types";
import type { BookProgress } from "./core/types/book";
import { DatabaseError } from "./core/types/errors";
import { db, type TyperDB, type TypingResult } from "./db";

/** The stored record for a completed test. */
export function toTypingResult(
	state: TypingState,
	{ result, charCount, errorCount }: CompletedTestPayload,
	bookTitle: string | undefined,
	now: number,
): TypingResult {
	return {
		mode: state.mode.type,
		wpm: result.wpm,
		rawWpm: result.rawWpm,
		accuracy: result.accuracy,
		consistency: result.consistency,
		duration: Math.floor(result.elapsed / 1000),
		charCount,
		errorCount,
		timestamp: now,
		textHash: simpleHash(state.text),
		bookTitle: state.mode.type === "book" ? bookTitle : undefined,
		...(isAfk(state) && { afk: true }),
	};
}

/**
 * Record a completed test and, in book mode, the Book reader's committed
 * progress, in one transaction: both land or neither does.
 */
export async function recordCompletion(
	result: Omit<TypingResult, "id">,
	progress?: Omit<BookProgress, "id">,
	database: TyperDB = db,
): Promise<void> {
	try {
		await database.transaction(
			"rw",
			database.results,
			database.bookProgress,
			async () => {
				await database.results.add(result);
				if (!progress) return;
				const existing = await database.bookProgress
					.where("bookId")
					.equals(progress.bookId)
					.first();
				await database.bookProgress.put({ ...progress, id: existing?.id });
			},
		);
	} catch (err) {
		throw new DatabaseError("Failed to record the completed test", {
			cause: err,
		});
	}
}
