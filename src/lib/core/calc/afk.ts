import type { TypingState } from "../types";

/** A time test with no keystroke in this final stretch was left running. */
export const AFK_WINDOW_MS = 5000;

/**
 * Whether a finished time test was left running: no character key in its
 * last 5 seconds, counting keys whose characters were erased since. Other
 * modes end on input, so they are never AFK.
 */
export function isAfk({
	mode,
	activity,
	startTime,
	endTime,
}: Pick<TypingState, "mode" | "activity" | "startTime" | "endTime">): boolean {
	if (mode.type !== "time" || startTime === null || endTime === null) {
		return false;
	}
	return endTime - (activity.lastAt ?? startTime) > AFK_WINDOW_MS;
}
