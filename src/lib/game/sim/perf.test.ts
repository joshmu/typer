import { describe, expect, it } from "vitest";
import { createInitialState } from "./state";
import { type GameEvent, step } from "./step";

/**
 * Hot-path guard for the pure sim. `step` runs on the main thread every frame,
 * so it must stay well inside one 16ms budget even under sustained load. This is
 * a coarse CI-safe probe (generous margins), not a micro-benchmark — it logs the
 * measured numbers so regressions are visible even when the assertion passes.
 *
 * Test file, so it may use performance.now()/Math freely (the determinism scan
 * only guards non-test sim/content sources).
 */
const LETTERS = "etaoinshrdlucmfwypvbgkjqxz";

function keyEvents(from: number, count: number): GameEvent[] {
	const events: GameEvent[] = [];
	for (let j = 0; j < count; j++) {
		events.push({ type: "key", key: LETTERS[(from + j) % LETTERS.length] });
	}
	return events;
}

describe("sim step performance", () => {
	it("processes worst-case steps within the CI budget", () => {
		// Warm up to a dense, high-wave *running* state by scripting a survival
		// burst of common letters each tick (mirrors the deep-run fixture). A
		// slower 1-key/tick warmup lets enemies accumulate toward the MAX_ALIVE
		// cap while abilities (spawn/heal/teleport) fire; seed 42 stays alive well
		// past tick 2100, so warming to 1500 then measuring 600 more (at 2 keys/
		// tick) keeps the whole window inside an active run.
		let s = createInitialState(42);
		let k = 0;
		let peakAlive = 0;
		for (let t = 0; t < 1500; t++) {
			s = step(s, keyEvents(k, 1));
			k += 1;
			if (s.enemies.length > peakAlive) peakAlive = s.enemies.length;
		}
		expect(s.status).toBe("running");

		// Measure 600 further steps, 2 key events per tick.
		const durations: number[] = [];
		for (let i = 0; i < 600; i++) {
			const events = keyEvents(k, 2);
			k += 2;
			const t0 = performance.now();
			s = step(s, events);
			durations.push(performance.now() - t0);
			if (s.enemies.length > peakAlive) peakAlive = s.enemies.length;
		}
		expect(s.status).toBe("running");
		expect(durations.length).toBe(600);

		const sorted = [...durations].sort((a, b) => a - b);
		const sum = durations.reduce((a, b) => a + b, 0);
		const avg = sum / durations.length;
		const p95 = sorted[Math.floor(sorted.length * 0.95)];
		const max = sorted[sorted.length - 1];

		console.log(
			`sim step — steps ${durations.length}, peakAlive ${peakAlive}, avg ${avg.toFixed(4)}ms, p95 ${p95.toFixed(4)}ms, max ${max.toFixed(4)}ms`,
		);

		// Generous CI-runner margins: on a dev machine these run in single-digit
		// microseconds; the ceiling exists to catch order-of-magnitude regressions.
		expect(avg).toBeLessThan(4);
		expect(p95).toBeLessThan(8);
	});
});
