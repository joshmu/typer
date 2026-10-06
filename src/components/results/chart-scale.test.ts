import { describe, expect, it } from "vitest";
import {
	chartIndices,
	errorMarks,
	formatSecond,
	monotonePath,
	movingAverage,
	peakOf,
	smoothingWindow,
	timeTicks,
	wpmScale,
} from "./chart-scale";

describe("timeTicks", () => {
	it("marks every 5 seconds on a short test, ending on its last second", () => {
		expect(timeTicks(15)).toEqual([1, 5, 10, 15]);
	});

	it("keeps the last second and drops a tick crowding it", () => {
		expect(timeTicks(17)).toEqual([1, 5, 10, 17]);
	});

	it("spreads ticks out on long tests", () => {
		expect(timeTicks(60)).toEqual([1, 10, 20, 30, 40, 50, 60]);
		expect(timeTicks(120)).toEqual([1, 20, 40, 60, 80, 100, 120]);
	});

	it("keeps a handful of ticks on a session hours long", () => {
		const ticks = timeTicks(200_000);
		expect(ticks.length).toBeLessThanOrEqual(8);
		expect(ticks.at(-1)).toBe(200_000);
	});

	it("marks the first and last second of a tiny test", () => {
		expect(timeTicks(2)).toEqual([1, 2]);
		expect(timeTicks(1)).toEqual([1]);
	});
});

describe("formatSecond", () => {
	it("reads seconds under a minute plainly and longer ones as m:ss", () => {
		expect(formatSecond(5)).toBe("5s");
		expect(formatSecond(60)).toBe("1:00");
		expect(formatSecond(95)).toBe("1:35");
	});

	it("reads an hour or more as h:mm:ss", () => {
		expect(formatSecond(3600)).toBe("1:00:00");
		expect(formatSecond(86_400)).toBe("24:00:00");
		expect(formatSecond(3_725)).toBe("1:02:05");
	});
});

describe("wpmScale", () => {
	it("rounds the top up to a tidy step with four bands", () => {
		expect(wpmScale(118)).toEqual({ max: 120, ticks: [0, 30, 60, 90, 120] });
		expect(wpmScale(58)).toEqual({ max: 60, ticks: [0, 15, 30, 45, 60] });
	});

	it("gives an empty chart a sensible range", () => {
		expect(wpmScale(0).max).toBeGreaterThan(0);
	});
});

describe("monotonePath", () => {
	it("draws a single segment through two points", () => {
		expect(
			monotonePath([
				[0, 0],
				[10, 10],
			]),
		).toMatch(/^M0,0 C/);
	});

	it("never overshoots a flat run", () => {
		const path = monotonePath([
			[0, 10],
			[10, 10],
			[20, 0],
		]);
		const ys = [...path.matchAll(/[\d.]+,(-?[\d.]+)/g)].map((m) =>
			Number(m[1]),
		);
		expect(Math.max(...ys)).toBeLessThanOrEqual(10);
	});

	it("is empty for no points", () => {
		expect(monotonePath([])).toBe("");
	});
});

describe("movingAverage", () => {
	it("averages each second with its neighbours", () => {
		expect(movingAverage([60, 120, 60, 120, 60], 3)).toEqual([
			90, 80, 100, 80, 90,
		]);
	});

	it("leaves a steady run steady", () => {
		expect(movingAverage([80, 80, 80, 80], 5)).toEqual([80, 80, 80, 80]);
	});

	it("passes short series through", () => {
		expect(movingAverage([42], 3)).toEqual([42]);
		expect(movingAverage([], 3)).toEqual([]);
	});
});

describe("smoothingWindow", () => {
	it("widens the window for longer tests", () => {
		expect(smoothingWindow(15)).toBe(3);
		expect(smoothingWindow(60)).toBe(5);
	});
});

/** A long session: 200k seconds of noise with one spike and one dip. */
function longSeries(): number[] {
	const v = Array.from({ length: 200_000 }, (_, i) => 40 + ((i * 37) % 11));
	v[123_457] = 190;
	v[77_777] = 0;
	return v;
}

describe("peakOf", () => {
	it("finds the peak of series too long to spread into Math.max", () => {
		expect(peakOf(longSeries(), [3, 250])).toBe(250);
	});

	it("is 0 with no samples", () => {
		expect(peakOf([], undefined)).toBe(0);
	});
});

describe("chartIndices", () => {
	it("keeps every second of a short test", () => {
		expect(chartIndices([5, 6, 7], 600)).toEqual([0, 1, 2]);
	});

	it("thins a long session to its budget, keeping each bucket's peak and dip", () => {
		const v = longSeries();
		const kept = chartIndices(v, 600);
		expect(kept.length).toBeLessThanOrEqual(602);
		expect(kept.length).toBeGreaterThan(300);
		expect(kept).toContain(123_457);
		expect(kept).toContain(77_777);
		expect(kept[0]).toBe(0);
		expect(kept.at(-1)).toBe(v.length - 1);
		for (let i = 1; i < kept.length; i++) {
			expect(kept[i]).toBeGreaterThan(kept[i - 1]);
		}
	});
});

describe("errorMarks", () => {
	it("marks each second with errors on a short test", () => {
		expect(errorMarks([0, 2, 0, 1], 4, 300)).toEqual([
			{ i: 1, n: 2 },
			{ i: 3, n: 1 },
		]);
	});

	it("merges a long session's errors into one mark per bucket", () => {
		const errors = Array.from({ length: 200_000 }, (_, i): number =>
			i % 7 ? 0 : 1,
		);
		const marks = errorMarks(errors, errors.length, 300);
		expect(marks.length).toBeLessThanOrEqual(300);
		expect(marks.reduce((sum, m) => sum + m.n, 0)).toBe(
			errors.reduce((sum, n) => sum + n, 0),
		);
	});
});
