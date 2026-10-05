import type { BestScope } from "./core/calc";
import { db, type TyperDB, type TypingResult } from "./db";
import { safeFrom } from "./safe-query";

export function useRecentResults(limit = 20) {
	return safeFrom<TypingResult[]>(
		() => db.results.orderBy("timestamp").reverse().limit(limit).toArray(),
		[],
	);
}

export interface PreviousBestQuery extends BestScope {
	/** Only results recorded before this timestamp count. */
	before: number;
}

/** The best WPM recorded before a result, in its mode; null if none. */
export async function findPreviousBest(
	{ mode, duration, option, before }: PreviousBestQuery,
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
				(duration === undefined || r.duration === duration) &&
				(option === undefined || r.option === option),
		)
		.each((r) => {
			if (best === null || r.wpm > best) best = r.wpm;
		});
	return best;
}
