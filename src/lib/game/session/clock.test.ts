import { describe, expect, it } from "vitest";
import { createFixedStepClock, MAX_CATCHUP_TICKS, TICK_MS } from "./clock";

describe("FixedStepClock", () => {
	it("defaults to 60Hz ticks with a 30-tick catch-up cap", () => {
		expect(TICK_MS).toBeCloseTo(1000 / 60);
		expect(MAX_CATCHUP_TICKS).toBe(30);
		const clock = createFixedStepClock(0);
		expect(clock.advance(TICK_MS * 2.5)).toBe(2);
	});

	it("runs one tick per elapsed tick interval", () => {
		const clock = createFixedStepClock(0, { tickMs: 10 });
		expect(clock.advance(10)).toBe(1);
		expect(clock.advance(40)).toBe(3);
	});

	it("carries a partial tick over to the next advance", () => {
		const clock = createFixedStepClock(0, { tickMs: 10 });
		expect(clock.advance(6)).toBe(0);
		expect(clock.advance(12)).toBe(1);
		expect(clock.advance(19)).toBe(0);
		expect(clock.advance(20)).toBe(1);
	});

	it("caps catch-up and drops the time past the cap", () => {
		const clock = createFixedStepClock(0, { tickMs: 10, maxCatchupTicks: 30 });
		expect(clock.advance(1005)).toBe(30);
		// the 70 dropped ticks are gone; only the 5ms remainder carries
		expect(clock.advance(1010)).toBe(1);
		expect(clock.advance(1019)).toBe(0);
	});

	it("reset discards elapsed time and the carried remainder", () => {
		const clock = createFixedStepClock(0, { tickMs: 10 });
		expect(clock.advance(8)).toBe(0);
		clock.reset(5000);
		expect(clock.advance(5009)).toBe(0);
		expect(clock.advance(5010)).toBe(1);
	});
});
