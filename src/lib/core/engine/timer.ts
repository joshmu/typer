import type { TypingState } from "../types";

export function isTimedTestComplete(
	state: TypingState,
	elapsedMs: number,
): boolean {
	if (state.mode.type !== "time") return false;
	return elapsedMs >= state.mode.seconds * 1000;
}
