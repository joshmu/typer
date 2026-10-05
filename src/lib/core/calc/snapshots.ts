import type { CharacterState } from "../types";

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
 * Raw WPM and mistakes for each second, bucketed like `collectPerSecondWPM`.
 * Only each character's last keystroke has a time, so its earlier mistyped
 * keys count in that same second; characters erased and left untyped drop out.
 */
export function collectPerSecondActivity(
	chars: CharacterState[],
	startTime: number,
	elapsedMs: number,
): PerSecondActivity {
	const typed = countPerSecond(chars, startTime, elapsedMs, keysOn);
	const errors = countPerSecond(chars, startTime, elapsedMs, (char) =>
		char.status === "incorrect" || char.status === "extra"
			? Math.max(char.mistakeCount, 1)
			: char.mistakeCount,
	);
	return { raw: toWpm(typed, elapsedMs), errors };
}

/** Character keys spent on a typed character: its mistakes plus a final right key. */
function keysOn(char: CharacterState): number {
	if (char.status === "pending" || char.status === "missed") return 0;
	return char.status === "correct"
		? 1 + char.mistakeCount
		: Math.max(char.mistakeCount, 1);
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
