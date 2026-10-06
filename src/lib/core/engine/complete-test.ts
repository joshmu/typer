import {
	type CharBreakdown,
	calculateAccuracy,
	calculateCharBreakdown,
	calculateRawWPM,
	calculateWPM,
	collectPerSecondWPM,
	perSecondConsistency,
	sampleSeconds,
} from "../calc";
import type { TypingState } from "../types";

export interface TestResult {
	wpm: number;
	rawWpm: number;
	accuracy: number;
	consistency: number;
	breakdown: CharBreakdown;
	elapsed: number;
	/** WPM per sample: per second, or per `sampleSeconds` on a long session. */
	wpmPerSecond: number[];
	/** Seconds each wpmPerSecond sample covers (1 up to 600 seconds). */
	sampleSeconds: number;
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
	const wpmPerSecond = collectPerSecondWPM(
		chars,
		state.startTime ?? 0,
		elapsed,
	);
	// Time tests run to their limit, so idle seconds count; other tests are
	// ended by the user or the text, and the idle tail before that does not.
	const consistency = perSecondConsistency(
		chars,
		state.startTime ?? 0,
		elapsed,
		state.mode.type === "time" ? null : state.activity.lastAt,
	);
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
			sampleSeconds: sampleSeconds(elapsed),
		},
		charCount: breakdown.total,
		errorCount: breakdown.incorrect + breakdown.extra,
	};
}
