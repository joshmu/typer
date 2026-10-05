import type { KeystrokeCounts } from "../types";

/**
 * Keystroke accuracy: correct character keys over all character keys, so a
 * typo still counts after it is corrected. Rounded down, so any mistake keeps
 * it below 100.
 */
export function calculateAccuracy({
	correct,
	incorrect,
}: KeystrokeCounts): number {
	const total = correct + incorrect;
	if (total === 0) return 100;
	return Math.floor((correct * 100) / total);
}
