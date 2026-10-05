import type { KeystrokeCounts } from "../types";

/**
 * Keystroke accuracy: correct character keys over all character keys, so a
 * typo still counts after it is corrected. A test with any mistake never
 * rounds up to 100.
 */
export function calculateAccuracy({
	correct,
	incorrect,
}: KeystrokeCounts): number {
	const total = correct + incorrect;
	if (total === 0) return 100;

	const percent = Math.round((correct / total) * 100);
	return incorrect > 0 ? Math.min(percent, 99) : percent;
}
