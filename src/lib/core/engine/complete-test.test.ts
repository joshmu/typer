import { describe, expect, it } from "vitest";
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

	it("collects per-second WPM snapshots", () => {
		const state = buildState({ correct: 25, durationMs: 30_000 });
		const out = completeTest(state);
		expect(Array.isArray(out.result.wpmPerSecond)).toBe(true);
	});
});
