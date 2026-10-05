import type { TypingState } from "../types";

/** A time test with no keystroke in this final stretch was left running. */
export const AFK_WINDOW_MS = 5000;

/**
 * Whether a finished time test was left running: no character typed in its
 * last 5 seconds. Other modes end on input, so they are never AFK.
 */
export function isAfk({
	mode,
	words,
	startTime,
	endTime,
}: Pick<TypingState, "mode" | "words" | "startTime" | "endTime">): boolean {
	if (mode.type !== "time" || startTime === null || endTime === null) {
		return false;
	}
	let lastKey = startTime;
	for (const word of words) {
		for (const char of word.characters) {
			if (char.timestamp !== null && char.timestamp > lastKey) {
				lastKey = char.timestamp;
			}
		}
	}
	return endTime - lastKey > AFK_WINDOW_MS;
}
