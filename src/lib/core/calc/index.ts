export { calculateAccuracy } from "./accuracy";
export { AFK_WINDOW_MS, isAfk } from "./afk";
export type { CharBreakdown } from "./breakdown";
export { calculateCharBreakdown } from "./breakdown";
export { calculateConsistency } from "./consistency";
export type { BestScope, PersonalBestOutcome } from "./personal-best";
export { bestScope, comparePersonalBest } from "./personal-best";
export type { PerSecondActivity } from "./snapshots";
export {
	collectPerSecondActivity,
	collectPerSecondWPM,
	trimIdleTail,
} from "./snapshots";
export { calculateRawWPM, calculateWPM, isLiveWpmReady } from "./wpm";
