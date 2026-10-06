import type { TestMode } from "@/lib/core/types";

/** A short name for a test's mode and option, e.g. "time 30s". */
export function modeLabel(mode: TestMode): string {
	switch (mode.type) {
		case "time":
			return `time ${mode.seconds}s`;
		case "words":
			return `words ${mode.count}`;
		case "quote":
			return `quote ${mode.length}`;
		default:
			return mode.type;
	}
}
