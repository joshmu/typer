import { collectPerSecondActivity, isAfk } from "../calc";
import type { TestMode, TypingState } from "../types";

/** What the results screen shows beyond the Result's headline stats. */
export interface ResultInsights {
	mode: TestMode;
	/** The saved record's timestamp, so bests compare only earlier results. */
	timestamp: number;
	afk: boolean;
	rawPerSecond: number[];
	errorsPerSecond: number[];
}

export function deriveResultInsights(
	state: TypingState,
	elapsed: number,
	now: number,
): ResultInsights {
	const chars = state.words.flatMap((w) => w.characters);
	const { raw, errors } = collectPerSecondActivity(
		chars,
		state.startTime ?? 0,
		elapsed,
	);
	return {
		mode: state.mode,
		timestamp: now,
		afk: isAfk(state),
		rawPerSecond: raw,
		errorsPerSecond: errors,
	};
}
