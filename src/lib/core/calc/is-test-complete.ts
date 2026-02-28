import type { TypingState } from "../types";

/**
 * Check if the typing test is complete.
 */
export function isTestComplete(state: TypingState): boolean {
	return state.endTime !== null;
}
