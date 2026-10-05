import {
	type CharBreakdown,
	calculateAccuracy,
	calculateCharBreakdown,
	calculateConsistency,
	calculateRawWPM,
	calculateWPM,
	collectPerSecondWPM,
} from "../calc";
import type { TypingState } from "../types";

export interface TestResult {
	wpm: number;
	rawWpm: number;
	accuracy: number;
	consistency: number;
	breakdown: CharBreakdown;
	elapsed: number;
	wpmPerSecond: number[];
}

export interface CompletedTestPayload {
	result: TestResult;
	charCount: number;
	errorCount: number;
}

export function completeTest(state: TypingState): CompletedTestPayload {
	const chars = state.words.flatMap((w) => w.characters);
	const elapsed =
		state.startTime && state.endTime ? state.endTime - state.startTime : 0;

	const wpm = calculateWPM(chars, elapsed);
	const rawWpm = calculateRawWPM(state.keystrokes, elapsed);
	const accuracy = calculateAccuracy(state.keystrokes);
	const wpmPerSecond = collectPerSecondWPM(chars, state.startTime ?? 0);
	const consistency = calculateConsistency(wpmPerSecond);
	const breakdown = calculateCharBreakdown(state);

	return {
		result: {
			wpm,
			rawWpm,
			accuracy,
			consistency,
			breakdown,
			elapsed,
			wpmPerSecond,
		},
		charCount: breakdown.total,
		errorCount: breakdown.incorrect + breakdown.extra,
	};
}
