import type { CharacterState, KeyActivity } from "../types";
import { calculateConsistency } from "./consistency";

const CHARS_PER_WORD = 5;
const MS_PER_MINUTE = 60_000;

/** The most samples a result's series keeps; longer sessions are bucketed. */
export const MAX_SAMPLES = 600;

/**
 * Seconds each series sample covers: 1 up to MAX_SAMPLES seconds, then wide
 * enough that a session of any length (a zen or book run left open for a day)
 * keeps at most MAX_SAMPLES samples.
 */
export function sampleSeconds(elapsedMs: number): number {
	const seconds = secondsIn(elapsedMs);
	return seconds <= MAX_SAMPLES ? 1 : Math.ceil(seconds / MAX_SAMPLES);
}

/**
 * WPM for each second of a test, from correct characters by timestamp, or for
 * each bucket of `sampleSeconds` on a long session. Spans the whole duration,
 * idle seconds included. A final fraction under half a second joins the last
 * sample; each sample is the rate over its true length.
 */
export function collectPerSecondWPM(
	chars: CharacterState[],
	startTime: number,
	elapsedMs: number,
): number[] {
	if (elapsedMs <= 0) return [];
	const { seconds, counts } = correctPerSecond(chars, startTime, elapsedMs);
	return toRates(bucket(seconds, counts, elapsedMs), elapsedMs);
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
	const keys = bucket(seconds, keyCounts, elapsedMs);
	return {
		raw: toRates(keys, elapsedMs),
		errors: bucket(seconds, errors, elapsedMs),
	};
}

/**
 * Sparse per-second counts summed into the test's samples (seconds, or
 * buckets of `sampleSeconds`), idle ones as zeros; any past the end join the
 * last.
 */
function bucket(
	seconds: readonly number[],
	counts: readonly number[],
	elapsedMs: number,
): number[] {
	const width = sampleSeconds(elapsedMs);
	const n = Math.ceil(secondsIn(elapsedMs) / width);
	const out = new Array<number>(n).fill(0);
	for (let k = 0; k < seconds.length; k++) {
		const i = Math.floor(Math.max(seconds[k], 0) / width);
		out[Math.min(i, n - 1)] += counts[k];
	}
	return out;
}

/** WPM for each sample's count over the sample's true length. */
function toRates(counts: number[], elapsedMs: number): number[] {
	const width = sampleSeconds(elapsedMs) * 1000;
	const n = counts.length;
	const lastMs = elapsedMs - (n - 1) * width;
	return counts.map((count, i) => {
		const ms = i === n - 1 ? lastMs : width;
		return Math.round(count / CHARS_PER_WORD / (ms / MS_PER_MINUTE));
	});
}

/** Correct characters per second, sparse: only seconds that hold any. */
function correctPerSecond(
	chars: CharacterState[],
	startTime: number,
	elapsedMs: number,
): { seconds: number[]; counts: number[] } {
	const last = secondsIn(elapsedMs) - 1;
	const bySecond = new Map<number, number>();
	for (const char of chars) {
		if (char.timestamp == null || char.status !== "correct") continue;
		const second = Math.floor((char.timestamp - startTime) / 1000);
		const s = Math.min(Math.max(second, 0), last);
		bySecond.set(s, (bySecond.get(s) ?? 0) + 1);
	}
	return { seconds: [...bySecond.keys()], counts: [...bySecond.values()] };
}

/**
 * Consistency of per-second WPM (see calculateConsistency) over the whole
 * test, or up to the second of `lastKeyAt` for a test ended by hand or by its
 * text running out. Idle seconds count as zeros without being built, so a
 * session left open for a day costs no more than the keys typed in it.
 */
export function perSecondConsistency(
	chars: CharacterState[],
	startTime: number,
	elapsedMs: number,
	lastKeyAt: number | null,
): number {
	if (elapsedMs <= 0) return calculateConsistency([]);
	const seconds = secondsIn(elapsedMs);
	if (seconds <= MAX_SAMPLES) {
		const samples = collectPerSecondWPM(chars, startTime, elapsedMs);
		return calculateConsistency(trimIdleTail(samples, lastKeyAt, startTime));
	}
	const n =
		lastKeyAt === null
			? seconds
			: Math.min(seconds, Math.floor((lastKeyAt - startTime) / 1000) + 1);
	if (n <= 1) return 100;
	const lastMs = elapsedMs - (seconds - 1) * 1000;
	const { seconds: at, counts } = correctPerSecond(chars, startTime, elapsedMs);
	const values: number[] = [];
	for (let k = 0; k < at.length; k++) {
		if (at[k] >= n) continue;
		const ms = at[k] === seconds - 1 ? lastMs : 1000;
		values.push(Math.round(counts[k] / CHARS_PER_WORD / (ms / MS_PER_MINUTE)));
	}
	let sum = 0;
	for (const v of values) sum += v;
	const mean = sum / n;
	if (mean === 0) return 100;
	let squares = (n - values.length) * mean * mean;
	for (const v of values) squares += (v - mean) ** 2;
	const cv = Math.sqrt(squares / n) / mean;
	return Math.round(Math.max(0, (1 - cv) * 100));
}

function secondsIn(elapsedMs: number): number {
	return Math.max(1, Math.round(elapsedMs / 1000));
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
