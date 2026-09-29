export const TICK_MS = 1000 / 60;
/** Degraded-tab guard: drop time instead of spiraling into catch-up. */
export const MAX_CATCHUP_TICKS = 30;

/** Turns wall-clock time into whole sim ticks. The caller supplies `now`. */
export type FixedStepClock = {
	/** Ticks due since the last call; time past the catch-up cap is dropped. */
	advance(now: number): number;
	/** Discard elapsed time and any partial tick; the next advance counts from `now`. */
	reset(now: number): void;
};

export function createFixedStepClock(
	now: number,
	{ tickMs = TICK_MS, maxCatchupTicks = MAX_CATCHUP_TICKS } = {},
): FixedStepClock {
	let lastTime = now;
	let accumulator = 0;
	return {
		advance(t) {
			accumulator += t - lastTime;
			lastTime = t;
			const ticks = Math.floor(accumulator / tickMs);
			accumulator -= ticks * tickMs;
			return Math.min(ticks, maxCatchupTicks);
		},
		reset(t) {
			lastTime = t;
			accumulator = 0;
		},
	};
}
