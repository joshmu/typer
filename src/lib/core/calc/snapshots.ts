import type { CharacterState } from "../types";

const CHARS_PER_WORD = 5;
const SECONDS_PER_MINUTE = 60;

export function collectPerSecondWPM(
	chars: CharacterState[],
	startTime: number,
): number[] {
	const typed = chars.filter(
		(c): c is CharacterState & { timestamp: number } =>
			c.status === "correct" && c.timestamp != null,
	);

	if (typed.length === 0) return [];

	const minTimestamp = Math.min(...typed.map((c) => c.timestamp));
	const origin = Math.max(startTime, minTimestamp);

	const buckets = new Map<number, number>();

	for (const char of typed) {
		const elapsed = char.timestamp - origin;
		const bucket = Math.floor(elapsed / 1000);
		buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
	}

	const maxBucket = Math.max(...buckets.keys());
	const result: number[] = [];

	for (let i = 0; i <= maxBucket; i++) {
		const count = buckets.get(i) ?? 0;
		const wpm = (count / CHARS_PER_WORD) * SECONDS_PER_MINUTE;
		result.push(wpm);
	}

	return result;
}
