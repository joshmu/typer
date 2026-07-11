import { db, type GameRun } from "./db";
import { safeFrom } from "./safe-query";

/**
 * Persist a completed Horde run. Returns the new record's id.
 * Mirrors the `results` persistence pattern (see book-progress.ts / queries.ts).
 */
export async function saveGameRun(run: Omit<GameRun, "id">): Promise<number> {
	return db.gameRuns.add(run as GameRun);
}

/**
 * One-shot read of the highest-scoring run, or undefined when none exist.
 * Unlike the reactive `useBestRun` signal — which can still be stale at the
 * exact moment a run ends — this reads the index directly, so callers deciding
 * "is this a new best?" at gameover compare against the truly-current record.
 */
export async function getBestRun(): Promise<GameRun | undefined> {
	return db.gameRuns.orderBy("score").reverse().first();
}

/**
 * Reactive query: the highest-scoring run, or undefined when none exist.
 * `score` is indexed (db v4), so this is served by the index directly.
 */
export function useBestRun() {
	return safeFrom<GameRun | undefined>(
		() => db.gameRuns.orderBy("score").reverse().first(),
		undefined,
	);
}

/**
 * Reactive query: most recent runs, newest first.
 */
export function useRecentRuns(limit = 10) {
	return safeFrom<GameRun[]>(
		() => db.gameRuns.orderBy("timestamp").reverse().limit(limit).toArray(),
		[],
	);
}
