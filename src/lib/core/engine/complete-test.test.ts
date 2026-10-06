import { describe, expect, it } from "vitest";
import { calculateConsistency } from "../calc";
import type { TypingState } from "../types";
import { createTypingState } from "../types/test-fixtures";
import { completeTest } from "./complete-test";
import { applyKeystroke } from "./process-keystroke";

const START = 1_000_000;

/** Type `keys` one every `stepMs` from START, then end the test at `durationMs`. */
function typeThenEnd(
	state: TypingState,
	keys: string[],
	durationMs: number,
	stepMs = 100,
): TypingState {
	keys.forEach((key, i) => {
		applyKeystroke(state, key, START + i * stepMs);
	});
	state.endTime ??= START + durationMs;
	return state;
}

const repeat = (key: string, n: number) => Array<string>(n).fill(key);

function buildState(opts: {
	correct: number;
	incorrect?: number;
	durationMs: number;
}) {
	const total = opts.correct + (opts.incorrect ?? 0);
	const state = createTypingState("x".repeat(total), {
		mode: { type: "time", seconds: 30 },
	});
	return typeThenEnd(
		state,
		[...repeat("x", opts.correct), ...repeat("z", opts.incorrect ?? 0)],
		opts.durationMs,
	);
}

describe("completeTest", () => {
	it("returns zero metrics when nothing was typed", () => {
		const state = createTypingState("hello world");
		const out = completeTest(state);
		expect(out.result.wpm).toBe(0);
		expect(out.result.rawWpm).toBe(0);
		expect(out.result.accuracy).toBe(100); // accuracy defaults to 100 when nothing typed
		expect(out.result.elapsed).toBe(0);
		expect(out.charCount).toBe(0);
		expect(out.errorCount).toBe(0);
	});

	it("computes WPM from correct chars over elapsed time", () => {
		// 25 correct chars in 30s = 25/5 / (30/60) = 5 / 0.5 = 10 WPM
		const state = buildState({ correct: 25, durationMs: 30_000 });
		const out = completeTest(state);
		expect(out.result.wpm).toBe(10);
		expect(out.result.rawWpm).toBe(10);
		expect(out.result.accuracy).toBe(100);
		expect(out.result.elapsed).toBe(30_000);
	});

	it("includes incorrect in raw WPM but not in net WPM", () => {
		const state = buildState({ correct: 20, incorrect: 5, durationMs: 30_000 });
		const out = completeTest(state);
		expect(out.result.wpm).toBe(8); // 20/5 / 0.5
		expect(out.result.rawWpm).toBe(10); // 25/5 / 0.5
		expect(out.result.accuracy).toBe(80);
	});

	it("keeps corrected typos in accuracy", () => {
		const state = createTypingState("abcde fghij");
		typeThenEnd(
			state,
			["a", "x", "Backspace", "b", "c", "q", "Backspace", "d", "e"],
			10_000,
		);
		const out = completeTest(state);
		expect(out.result.breakdown.incorrect).toBe(0);
		expect(out.result.accuracy).toBe(71); // 5 correct of 7 character keys
		expect(out.result.rawWpm).toBe(8); // 7 keys / 5 / (10s / 60)
		expect(out.result.wpm).toBe(6); // 5 correct chars / 5 / (10s / 60)
	});

	it("does not count text the user never reached as missed", () => {
		const state = createTypingState("the quick brown fox jumps over", {
			mode: { type: "time", seconds: 15 },
		});
		typeThenEnd(state, ["t", "h", "e", " ", "q", "x"], 15_000);
		const out = completeTest(state);
		expect(out.result.breakdown).toEqual({
			correct: 5,
			incorrect: 1,
			missed: 0,
			extra: 0,
			total: 6,
		});
		expect(out.charCount).toBe(6);
	});

	it("populates breakdown counts", () => {
		const state = buildState({ correct: 6, incorrect: 4, durationMs: 10_000 });
		const out = completeTest(state);
		expect(out.result.breakdown).toEqual({
			correct: 6,
			incorrect: 4,
			missed: 0,
			extra: 0,
			total: 10,
		});
		expect(out.charCount).toBe(10);
		expect(out.errorCount).toBe(4);
	});

	it("samples every second of a time test, idle seconds included", () => {
		// 45 correct chars over the first 9s, then idle until the 15s limit
		const state = createTypingState("x".repeat(60), {
			mode: { type: "time", seconds: 15 },
		});
		typeThenEnd(state, repeat("x", 45), 15_000, 200);
		const out = completeTest(state);
		expect(out.result.elapsed).toBe(15_000);
		expect(out.result.wpmPerSecond).toHaveLength(15);
		expect(out.result.wpmPerSecond.slice(9)).toEqual([0, 0, 0, 0, 0, 0]);
	});

	it("scores idle seconds as inconsistent", () => {
		const text = "x".repeat(80);
		const time = { mode: { type: "time" as const, seconds: 15 as const } };
		const steady = typeThenEnd(
			createTypingState(text, time),
			repeat("x", 75),
			15_000,
			200,
		);
		const stalled = typeThenEnd(
			createTypingState(text, time),
			repeat("x", 45),
			15_000,
			200,
		);
		expect(completeTest(steady).result.consistency).toBe(100);
		expect(completeTest(stalled).result.consistency).toBeLessThan(50);
	});

	it("ignores the idle tail before Esc when scoring a zen run's consistency", () => {
		// A steady 60 WPM for 60s, then 2s idle before Esc
		const state = createTypingState("x".repeat(400), { mode: { type: "zen" } });
		typeThenEnd(state, repeat("x", 300), 62_000, 200);
		const out = completeTest(state);
		expect(out.result.wpmPerSecond).toHaveLength(62);
		expect(out.result.wpmPerSecond.slice(60)).toEqual([0, 0]);
		expect(out.result.consistency).toBeGreaterThanOrEqual(98);
	});

	it("ends a zen run's idle tail at its last key, even an erased one", () => {
		const state = createTypingState("x".repeat(400), { mode: { type: "zen" } });
		for (let i = 0; i < 50; i++) applyKeystroke(state, "x", START + i * 200);
		// Ten keys, each erased at once, through seconds 10 and 11; Esc at 30s
		for (let i = 0; i < 10; i++) {
			applyKeystroke(state, "z", START + 10_000 + i * 200);
			applyKeystroke(state, "Backspace", START + 10_100 + i * 200);
		}
		state.endTime = START + 30_000;
		const samples = completeTest(state).result.wpmPerSecond;
		expect(completeTest(state).result.consistency).toBe(
			calculateConsistency(samples.slice(0, 12)),
		);
	});

	it("completes a zen run left open for a day quickly, with bounded series", () => {
		const state = createTypingState("x".repeat(400), { mode: { type: "zen" } });
		for (let i = 0; i < 50; i++) applyKeystroke(state, "x", START + i * 200);
		state.endTime = START + 24 * 3600 * 1000;
		const t0 = performance.now();
		const { result } = completeTest(state);
		expect(performance.now() - t0).toBeLessThan(50);
		expect(result.sampleSeconds).toBe(144);
		expect(result.wpmPerSecond.length).toBeLessThanOrEqual(600);
		// a steady 60 WPM until the last key; the idle day after it is dropped
		expect(result.consistency).toBe(100);
	});

	it("keeps one sample per second on a short test", () => {
		const state = buildState({ correct: 20, durationMs: 15_000 });
		const { result } = completeTest(state);
		expect(result.sampleSeconds).toBe(1);
		expect(result.wpmPerSecond).toHaveLength(15);
	});

	it("keeps every second of a time test in consistency", () => {
		const state = createTypingState("x".repeat(400), {
			mode: { type: "time", seconds: 60 },
		});
		// Steady for 58s, idle for the last 2s
		typeThenEnd(state, repeat("x", 290), 60_000, 200);
		expect(completeTest(state).result.consistency).toBeLessThan(90);
	});
});
