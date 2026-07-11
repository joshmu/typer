import type { GameState } from "./state";

export type RunStats = {
	score: number;
	wave: number;
	kills: number;
	/** Elapsed seconds — sim runs at a fixed 60 ticks/second. */
	durationSeconds: number;
	/** hits / (hits + misses) * 100; 100 when no keys were pressed. */
	accuracy: number;
	/** Words-per-minute (typed chars / 5 per minute), rounded. */
	wpm: number;
};

const TICKS_PER_SECOND = 60;

/**
 * Derive presentation stats from a (usually gameover) sim state. Pure — no
 * framework or DOM. WPM uses the standard 5-chars-per-word convention, matching
 * `calculateWPM` in `src/lib/core/calc`; the core helper takes a
 * `CharacterState[]`, which the sim does not retain, so we compute the same
 * math directly from the `hits` counter (chars/5 per minute).
 */
export function deriveRunStats(state: GameState): RunStats {
	const durationSeconds = state.tick / TICKS_PER_SECOND;
	const keys = state.hits + state.misses;
	const accuracy = keys === 0 ? 100 : (state.hits / keys) * 100;
	const wpm =
		durationSeconds === 0
			? 0
			: Math.round(state.hits / 5 / (durationSeconds / 60));
	return {
		score: state.score,
		wave: state.wave,
		kills: state.kills,
		durationSeconds,
		accuracy,
		wpm,
	};
}
