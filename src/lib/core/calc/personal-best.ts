import type { TestMode } from "../types";

/** How a result stands against the best earlier result in its mode. */
export type PersonalBestOutcome =
	| { kind: "new"; delta: number; previous: number }
	| { kind: "held"; best: number }
	| { kind: "first" }
	| { kind: "afk" }
	| { kind: "none" };

export function comparePersonalBest(
	wpm: number,
	previousBest: number | null,
	afk: boolean,
): PersonalBestOutcome {
	if (afk) return { kind: "afk" };
	if (previousBest === null)
		return wpm > 0 ? { kind: "first" } : { kind: "none" };
	if (wpm > previousBest) {
		return { kind: "new", delta: wpm - previousBest, previous: previousBest };
	}
	return { kind: "held", best: previousBest };
}

/** Which earlier results a test's best is compared with. */
export interface BestScope {
	mode: string;
	/** Time tests: the test length in seconds. */
	duration?: number;
	/** Words tests: the word count; quotes: the length. */
	option?: string;
}

/** The results a test competes with, or null for modes with no best. */
export function bestScope(mode: TestMode): BestScope | null {
	switch (mode.type) {
		case "time":
			return { mode: "time", duration: mode.seconds };
		case "words":
			return { mode: "words", option: String(mode.count) };
		case "quote":
			return { mode: "quote", option: mode.length };
		default:
			return null;
	}
}
