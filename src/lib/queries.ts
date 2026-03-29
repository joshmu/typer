import { db, type TypingResult } from "./db";
import { safeFrom } from "./safe-query";

export function useRecentResults(limit = 20) {
	return safeFrom<TypingResult[]>(
		() => db.results.orderBy("timestamp").reverse().limit(limit).toArray(),
		[],
	);
}

export function usePersonalBest(mode?: string) {
	return safeFrom<TypingResult | undefined>(() => {
		if (mode) {
			return db.results
				.where("mode")
				.equals(mode)
				.reverse()
				.sortBy("wpm")
				.then((results) => results[0]);
		}
		return db.results.orderBy("wpm").reverse().first();
	}, undefined);
}

export function useResultCount() {
	return safeFrom<number>(() => db.results.count(), 0);
}
