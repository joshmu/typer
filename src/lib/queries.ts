import { db, type TyperDB, type TypingResult } from "./db";
import { safeFrom } from "./safe-query";

export function useRecentResults(limit = 20) {
	return safeFrom<TypingResult[]>(
		() => db.results.orderBy("timestamp").reverse().limit(limit).toArray(),
		[],
	);
}

/** The fastest counted result, AFK results left out. */
export function usePersonalBest(mode?: string) {
	return safeFrom<TypingResult | undefined>(() => {
		if (mode) {
			return db.results
				.where("mode")
				.equals(mode)
				.filter((r) => !r.afk)
				.reverse()
				.sortBy("wpm")
				.then((results) => results[0]);
		}
		return db.results
			.orderBy("wpm")
			.reverse()
			.filter((r) => !r.afk)
			.first();
	}, undefined);
}

export interface PreviousBestQuery {
	mode: string;
	/** Time tests only compare against tests of the same length. */
	duration?: number;
	/** Only results recorded before this timestamp count. */
	before: number;
}

/** The best WPM recorded before a result, in its mode; null if none. */
export async function findPreviousBest(
	{ mode, duration, before }: PreviousBestQuery,
	database: TyperDB = db,
): Promise<number | null> {
	let best: number | null = null;
	await database.results
		.where("mode")
		.equals(mode)
		.filter(
			(r) =>
				!r.afk &&
				r.timestamp < before &&
				(duration === undefined || r.duration === duration),
		)
		.each((r) => {
			if (best === null || r.wpm > best) best = r.wpm;
		});
	return best;
}
