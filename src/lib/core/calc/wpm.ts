import type { CharacterState, KeystrokeCounts } from "../types";

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
 * Raw words per minute: every character keystroke, right or wrong, including
 * ones later backspaced.
 */
export function calculateRawWPM(
	{ correct, incorrect }: KeystrokeCounts,
	elapsedMs: number,
): number {
	if (elapsedMs === 0) return 0;
	return Math.round((correct + incorrect) / 5 / (elapsedMs / 60_000));
}
