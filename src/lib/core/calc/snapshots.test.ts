import { describe, expect, it } from "vitest";
import type { CharacterState } from "../types";
import { createCorrectChar, createIncorrectChar } from "../types/test-fixtures";
import { calculateConsistency } from "./consistency";
import {
	collectPerSecondActivity,
	collectPerSecondWPM,
	perSecondConsistency,
	sampleSeconds,
	trimIdleTail,
} from "./snapshots";

const START = 1000;

/** `n` correct chars typed evenly across [fromMs, toMs) after START. */
function correctBetween(n: number, fromMs: number, toMs: number) {
	const step = (toMs - fromMs) / n;
	return Array.from({ length: n }, (_, i) => ({
		...createCorrectChar("a"),
		timestamp: START + fromMs + i * step,
	}));
}

describe("collectPerSecondWPM", () => {
	it("groups correct characters into 1-second buckets", () => {
		const chars = [
			...correctBetween(5, 0, 1000),
			...correctBetween(10, 1000, 2000),
		];
		// 5 chars = 1 word in a second = 60 WPM; 10 chars = 120 WPM
		expect(collectPerSecondWPM(chars, START, 2000)).toEqual([60, 120]);
	});

	it("covers every second of a time test, idle seconds included", () => {
		const chars = correctBetween(45, 0, 9000);
		const samples = collectPerSecondWPM(chars, START, 15_000);
		expect(samples).toHaveLength(15);
		expect(samples.slice(0, 9).every((wpm) => wpm === 60)).toBe(true);
		expect(samples.slice(9)).toEqual([0, 0, 0, 0, 0, 0]);
	});

	it("records an idle second mid-test as zero", () => {
		const chars = [
			...correctBetween(5, 0, 1000),
			...correctBetween(5, 2000, 3000),
		];
		expect(collectPerSecondWPM(chars, START, 3000)).toEqual([60, 0, 60]);
	});

	it("is zero for every second when nothing was typed correctly", () => {
		const chars = [{ ...createIncorrectChar("a", "x"), timestamp: START }];
		expect(collectPerSecondWPM(chars, START, 3000)).toEqual([0, 0, 0]);
	});

	it("folds a short final fraction into the last second at its true rate", () => {
		// 7.3s at a steady 60 WPM: 7 samples, the last spanning 1.3s
		const chars = correctBetween(36, 0, 7300);
		const samples = collectPerSecondWPM(chars, START, 7300);
		expect(samples).toHaveLength(7);
		expect(samples.every((wpm) => Math.abs(wpm - 60) <= 12)).toBe(true);
	});

	it("gives a longer final fraction its own second at its true rate", () => {
		// 7.6s at a steady 60 WPM: 8 samples, the last spanning 0.6s
		const chars = correctBetween(38, 0, 7600);
		const samples = collectPerSecondWPM(chars, START, 7600);
		expect(samples).toHaveLength(8);
		expect(samples.every((wpm) => Math.abs(wpm - 60) <= 12)).toBe(true);
	});

	it("returns no samples for a test with no duration", () => {
		expect(collectPerSecondWPM([], START, 0)).toEqual([]);
	});

	it("ignores incorrect characters", () => {
		const chars: CharacterState[] = [
			{ ...createCorrectChar("a"), timestamp: START + 100 },
			{ ...createIncorrectChar("b", "x"), timestamp: START + 200 },
			{ ...createCorrectChar("c"), timestamp: START + 300 },
		];
		// 2 correct chars / 5 * 60 = 24 WPM
		expect(collectPerSecondWPM(chars, START, 1000)).toEqual([24]);
	});

	it("ignores characters without timestamps", () => {
		const chars: CharacterState[] = [
			{ ...createCorrectChar("a"), timestamp: START + 100 },
			{ ...createCorrectChar("b"), timestamp: null },
		];
		expect(collectPerSecondWPM(chars, START, 1000)).toEqual([12]);
	});
});

describe("trimIdleTail", () => {
	it("drops the seconds after the last keystroke", () => {
		expect(trimIdleTail([60, 60, 0, 0], START + 1900, START)).toEqual([60, 60]);
	});

	it("keeps the second the last keystroke landed in", () => {
		expect(trimIdleTail([60, 0, 0, 0], START + 2500, START)).toEqual([
			60, 0, 0,
		]);
	});

	it("leaves samples alone when nothing was typed", () => {
		expect(trimIdleTail([0, 0], null, START)).toEqual([0, 0]);
	});
});

describe("collectPerSecondActivity", () => {
	/** The sparse activity a run with these dense per-second counts records. */
	const activity = (keysPerSecond: number[], errorsPerSecond: number[]) => {
		const out = {
			lastAt: null,
			seconds: [] as number[],
			keys: [] as number[],
			errors: [] as number[],
		};
		keysPerSecond.forEach((n, i) => {
			if (n === 0) return;
			out.seconds.push(i);
			out.keys.push(n);
			out.errors.push(errorsPerSecond[i]);
		});
		return out;
	};

	it("fills the seconds between sparse entries with zeros", () => {
		const gap = {
			lastAt: null,
			seconds: [0, 4],
			keys: [5, 10],
			errors: [0, 2],
		};
		const out = collectPerSecondActivity(gap, 5000);
		expect(out.raw).toEqual([60, 0, 0, 0, 120]);
		expect(out.errors).toEqual([0, 0, 0, 0, 2]);
	});

	it("turns character keys per second into raw WPM", () => {
		// 10 keys in a second = 2 words = 120 WPM
		expect(
			collectPerSecondActivity(activity([10, 5], [0, 0]), 2000).raw,
		).toEqual([120, 60]);
	});

	it("carries mistakes per second through", () => {
		expect(
			collectPerSecondActivity(activity([5, 6, 2], [0, 1, 1]), 3000).errors,
		).toEqual([0, 1, 1]);
	});

	it("folds a final fraction under half a second into the last second", () => {
		// 2.4s rounds to 2 samples; the last spans 1.4s with 10 keys
		const out = collectPerSecondActivity(activity([5, 5, 5], [0, 1, 1]), 2400);
		expect(out.raw).toEqual([60, 86]);
		expect(out.errors).toEqual([0, 2]);
	});

	it("spans the whole duration, idle seconds included", () => {
		const out = collectPerSecondActivity(activity([5], [0]), 15_000);
		expect(out.raw).toHaveLength(15);
		expect(out.raw.slice(1)).toEqual(Array(14).fill(0));
		expect(out.errors).toHaveLength(15);
	});

	it("returns no samples for a test with no duration", () => {
		expect(collectPerSecondActivity(activity([], []), 0)).toEqual({
			raw: [],
			errors: [],
		});
	});
});

const DAY_MS = 24 * 3600 * 1000;

describe("sampleSeconds", () => {
	it("keeps one sample per second up to 600 seconds", () => {
		expect(sampleSeconds(15_000)).toBe(1);
		expect(sampleSeconds(600_000)).toBe(1);
	});

	it("widens samples so a longer session has at most 600", () => {
		expect(sampleSeconds(601_000)).toBe(2);
		expect(sampleSeconds(DAY_MS)).toBe(144);
	});
});

describe("long sessions", () => {
	it("buckets a day-long session's WPM into 600 true per-bucket rates", () => {
		// 300 correct chars in the first minute, then idle for the rest of the day
		const samples = collectPerSecondWPM(
			correctBetween(300, 0, 60_000),
			START,
			DAY_MS,
		);
		expect(samples).toHaveLength(600);
		// 300 chars = 60 words over a 144s bucket = 25 WPM
		expect(samples[0]).toBe(25);
		expect(samples.slice(1).every((v) => v === 0)).toBe(true);
	});

	it("buckets a day-long session's raw keys and errors the same way", () => {
		const out = collectPerSecondActivity(
			{ lastAt: null, seconds: [0, 86_399], keys: [12, 6], errors: [1, 0] },
			DAY_MS,
		);
		expect(out.raw).toHaveLength(600);
		expect(out.errors).toHaveLength(600);
		// 12 keys over 144s = 1 WPM
		expect(out.raw[0]).toBe(1);
		expect(out.errors[0]).toBe(1);
		expect(out.errors.reduce((a, b) => a + b, 0)).toBe(1);
	});
});

describe("perSecondConsistency", () => {
	/** Dense per-second WPM, the reference the sparse path must match. */
	function dense(chars: CharacterState[], elapsedMs: number): number[] {
		const seconds = Math.max(1, Math.round(elapsedMs / 1000));
		const counts = new Array<number>(seconds).fill(0);
		for (const c of chars) {
			if (c.status !== "correct" || c.timestamp == null) continue;
			const s = Math.floor((c.timestamp - START) / 1000);
			counts[Math.min(Math.max(s, 0), seconds - 1)] += 1;
		}
		const lastMs = elapsedMs - (seconds - 1) * 1000;
		return counts.map((n, i) =>
			Math.round(n / 5 / ((i === seconds - 1 ? lastMs : 1000) / 60_000)),
		);
	}
	// bursts of typing with gaps, across a session longer than 600 seconds
	const chars = [
		...correctBetween(40, 0, 9_000),
		...correctBetween(25, 300_000, 307_000),
		...correctBetween(60, 640_000, 655_500),
	];

	it("matches the per-second figure without building every second", () => {
		expect(perSecondConsistency(chars, START, 700_400, null)).toBe(
			calculateConsistency(dense(chars, 700_400)),
		);
	});

	it("stops at the last key for a session ended by hand", () => {
		const lastKey = START + 655_400;
		expect(perSecondConsistency(chars, START, 900_000, lastKey)).toBe(
			calculateConsistency(trimIdleTail(dense(chars, 900_000), lastKey, START)),
		);
	});

	it("matches the short-test figure exactly", () => {
		const short = correctBetween(30, 0, 9_000);
		expect(perSecondConsistency(short, START, 15_000, null)).toBe(
			calculateConsistency(collectPerSecondWPM(short, START, 15_000)),
		);
	});
});
