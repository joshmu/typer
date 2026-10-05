/**
 * Render quality guards for slow GPUs. Pure: no Babylon, no DOM.
 */

/** A one-way quality step: first drop post (MSAA and bloom), then resolution. */
export type QualityStep = "shed-post" | "lower-resolution";

const STEPS: readonly QualityStep[] = ["shed-post", "lower-resolution"];
// a frame longer than this is a pause, a hidden tab or a hitch: not a trend
const GAP_MS = 250;
// recompute the percentile at most this often
const CHECK_EVERY_MS = 200;
// enough slots for a full window at 240Hz
const SLOTS = 512;

// renderer strings of software or fallback GL (headless CI's SwiftShader,
// Mesa's llvmpipe, Windows' WARP)
const SLOW_GL =
	/swiftshader|llvmpipe|softpipe|software|basic render driver|\bwarp\b/i;

/** Whether a GL renderer string names a software or fallback rasteriser. */
export function isSlowRenderer(renderer: string): boolean {
	return SLOW_GL.test(renderer);
}

export type QualityWatch = {
	/** Record a frame of `dt` ms ending at `now`; returns a step to take, if any. */
	sample(dt: number, now: number): QualityStep | null;
	/** Steps taken so far (0 = full quality). */
	level(): number;
};

/**
 * Watches frame times and steps quality down when the rolling p90 over
 * `windowMs` exceeds `limitMs`. Each step needs a fresh full window of slow
 * frames, and quality never steps back up within a run.
 */
export function createQualityWatch({
	windowMs = 2000,
	limitMs = 20,
}: {
	windowMs?: number;
	limitMs?: number;
} = {}): QualityWatch {
	const times = new Float64Array(SLOTS);
	const dts = new Float64Array(SLOTS);
	const scratch = new Float64Array(SLOTS);
	let head = 0;
	let count = 0;
	let since = Number.NaN;
	let lastCheck = Number.NEGATIVE_INFINITY;
	let level = 0;

	function reset(now: number): void {
		head = 0;
		count = 0;
		since = now;
	}

	return {
		sample(dt, now) {
			if (level >= STEPS.length || !(dt > 0) || dt > GAP_MS) return null;
			if (Number.isNaN(since)) since = now - dt;
			times[head] = now;
			dts[head] = dt;
			head = (head + 1) % SLOTS;
			count = Math.min(SLOTS, count + 1);
			// only judge a full window, and not every frame
			if (now - since < windowMs || now - lastCheck < CHECK_EVERY_MS) {
				return null;
			}
			lastCheck = now;
			let n = 0;
			for (let i = 0; i < count; i++) {
				const k = (head - 1 - i + SLOTS) % SLOTS;
				if (now - times[k] > windowMs) break;
				scratch[n++] = dts[k];
			}
			const window = scratch.subarray(0, n).sort();
			const p90 = window[Math.min(n - 1, Math.floor(n * 0.9))];
			if (p90 <= limitMs) return null;
			const step = STEPS[level];
			level += 1;
			reset(now);
			return step;
		},
		level: () => level,
	};
}
