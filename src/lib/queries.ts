import { from } from "solid-js";
import { liveQuery } from "dexie";
import { db, type TypingResult } from "./db";

export function useRecentResults(limit = 20) {
	return from<TypingResult[]>(
		liveQuery(() =>
			db.results.orderBy("timestamp").reverse().limit(limit).toArray(),
		),
	);
}

export function usePersonalBest(mode?: string) {
	return from<TypingResult | undefined>(
		liveQuery(() => {
			if (mode) {
				return db.results
					.where("mode")
					.equals(mode)
					.reverse()
					.sortBy("wpm")
					.then((results) => results[0]);
			}
			return db.results
				.orderBy("wpm")
				.reverse()
				.first();
		}),
	);
}

export function useResultCount() {
	return from<number>(liveQuery(() => db.results.count()));
}
