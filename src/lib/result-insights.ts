import { createSignal } from "solid-js";
import { collectPerSecondActivity, isAfk } from "@/lib/core/calc";
import type { TestMode, TypingState } from "@/lib/core/types";

/** What the results screen shows beyond the Result itself. */
export interface ResultInsights {
	mode: TestMode;
	/** The saved record's timestamp, so bests compare only earlier results. */
	timestamp: number;
	/** Whole seconds, as stored. */
	duration: number;
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
		duration: Math.floor(elapsed / 1000),
		afk: isAfk(state),
		rawPerSecond: raw,
		errorsPerSecond: errors,
	};
}

const [latest, setLatest] = createSignal<ResultInsights | null>(null);

/** Detail for the most recently completed test. */
export const latestResultInsights = latest;

export function publishResultInsights(insights: ResultInsights): void {
	setLatest(insights);
}
