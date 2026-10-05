import { describe, expect, it } from "vitest";
import { formatSecond, monotonePath, timeTicks, wpmScale } from "./chart-scale";

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
