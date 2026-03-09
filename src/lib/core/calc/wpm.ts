import type { CharacterState } from "../types";

/**
 * Calculate words per minute.
 * WPM = (correct characters / 5) / elapsed minutes
 * Standard: 1 word = 5 characters
 */
export function calculateWPM(
	chars: CharacterState[],
	elapsedMs: number,
): number {
	if (elapsedMs === 0 || chars.length === 0) return 0;

	const correctChars = chars.filter((c) => c.status === "correct").length;
	const elapsedMinutes = elapsedMs / 60_000;

	return Math.round(correctChars / 5 / elapsedMinutes);
}

/**
 * Calculate raw words per minute.
 * Counts ALL typed characters (correct + incorrect + extra), excluding pending and missed.
 */
export function calculateRawWPM(
	chars: CharacterState[],
	elapsedMs: number,
): number {
	if (elapsedMs === 0 || chars.length === 0) return 0;

	const typedChars = chars.filter(
		(c) => c.status !== "pending" && c.status !== "missed",
	).length;

	return Math.round(typedChars / 5 / (elapsedMs / 60_000));
}
