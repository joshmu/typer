import type { CharacterState, KeyActivity } from "../types";

const CHARS_PER_WORD = 5;
const MS_PER_MINUTE = 60_000;

/**
 * WPM for each second of a test, from correct characters by timestamp. Spans
 * the whole duration, idle seconds included. A final fraction under half a
 * second joins the last second; each sample is the rate over its true length.
 */
export function collectPerSecondWPM(
	chars: CharacterState[],
	startTime: number,
	elapsedMs: number,
): number[] {
	const counts = countPerSecond(chars, startTime, elapsedMs, (char) =>
		char.status === "correct" ? 1 : 0,
	);
	return toWpm(counts, elapsedMs);
}

export interface PerSecondActivity {
	/** WPM from every character key, right or wrong, per second. */
	raw: number[];
	/** Mistyped keys per second, corrected or not. */
	errors: number[];
}

/**
 * Raw WPM and mistakes for each second, bucketed like `collectPerSecondWPM`,
 * from the keys counted as they landed, so erased ones still show.
 */
export function collectPerSecondActivity(
	{ seconds, keys: keyCounts, errors }: KeyActivity,
	elapsedMs: number,
): PerSecondActivity {
	if (elapsedMs <= 0) return { raw: [], errors: [] };
	const keys = fold(seconds, keyCounts, elapsedMs);
	return {
		raw: toWpm(keys, elapsedMs),
		errors: fold(seconds, errors, elapsedMs),
	};
}

/** Sparse per-second counts laid over every second of the test, idle ones
 * as zeros; any past the end join the last. */
function fold(
	seconds: readonly number[],
	counts: readonly number[],
	elapsedMs: number,
): number[] {
	const n = secondsIn(elapsedMs);
	const out = new Array<number>(n).fill(0);
	for (let k = 0; k < seconds.length; k++) {
		out[Math.min(Math.max(seconds[k], 0), n - 1)] += counts[k];
	}
	return out;
}

function secondsIn(elapsedMs: number): number {
	return Math.max(1, Math.round(elapsedMs / 1000));
}

function countPerSecond(
	chars: CharacterState[],
	startTime: number,
	elapsedMs: number,
	weigh: (char: CharacterState) => number,
): number[] {
	if (elapsedMs <= 0) return [];
	const seconds = secondsIn(elapsedMs);
	const counts = new Array<number>(seconds).fill(0);
	for (const char of chars) {
		if (char.timestamp == null) continue;
		const weight = weigh(char);
		if (weight === 0) continue;
		const second = Math.floor((char.timestamp - startTime) / 1000);
		counts[Math.min(Math.max(second, 0), seconds - 1)] += weight;
	}
	return counts;
}

function toWpm(counts: number[], elapsedMs: number): number[] {
	const seconds = counts.length;
	const lastMs = elapsedMs - (seconds - 1) * 1000;
	return counts.map((count, i) => {
		const ms = i === seconds - 1 ? lastMs : 1000;
		return Math.round(count / CHARS_PER_WORD / (ms / MS_PER_MINUTE));
	});
}

/**
 * Per-second samples up to the second of the last character key (erased or
 * not), dropping the idle tail before a test is ended by hand (Esc) or by its
 * text running out.
 */
export function trimIdleTail(
	samples: number[],
	lastKeyAt: number | null,
	startTime: number,
): number[] {
	if (lastKeyAt === null) return samples;
	return samples.slice(0, Math.floor((lastKeyAt - startTime) / 1000) + 1);
}
