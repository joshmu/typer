import type { CharacterState } from "../types";

/**
 * Calculate accuracy as a percentage.
 * accuracy = (correct / total typed) * 100
 * Only counts characters that have been typed (not pending).
 */
export function calculateAccuracy(chars: CharacterState[]): number {
	const typed = chars.filter((c) => c.typed !== null);
	if (typed.length === 0) return 100;

	const correct = typed.filter((c) => c.status === "correct").length;
	return Math.round((correct / typed.length) * 100);
}
