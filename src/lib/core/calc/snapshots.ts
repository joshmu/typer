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
	if (elapsedMs <= 0) return [];

	const seconds = Math.max(1, Math.round(elapsedMs / 1000));
	const counts = new Array<number>(seconds).fill(0);

	for (const char of chars) {
		if (char.status !== "correct" || char.timestamp == null) continue;
		const second = Math.floor((char.timestamp - startTime) / 1000);
		counts[Math.min(Math.max(second, 0), seconds - 1)]++;
	}

	const lastMs = elapsedMs - (seconds - 1) * 1000;
	return counts.map((count, i) => {
		const ms = i === seconds - 1 ? lastMs : 1000;
		return Math.round(count / CHARS_PER_WORD / (ms / MS_PER_MINUTE));
	});
}

/**
 * Per-second samples up to the second of the last keystroke, dropping the
 * idle tail before a test is ended by hand (Esc) or by its text running out.
 */
export function trimIdleTail(
	samples: number[],
	chars: CharacterState[],
	startTime: number,
): number[] {
	let lastKey = -1;
	for (const char of chars) {
		if (char.timestamp != null && char.timestamp > lastKey) {
			lastKey = char.timestamp;
		}
	}
	if (lastKey < 0) return samples;
	return samples.slice(0, Math.floor((lastKey - startTime) / 1000) + 1);
}
