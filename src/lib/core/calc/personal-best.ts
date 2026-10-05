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
