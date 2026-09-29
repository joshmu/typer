import { describe, expect, it } from "vitest";
import {
	createCorrectChar,
	createIncorrectChar,
	createTypingState,
} from "../types/test-fixtures";
import { completeTest } from "./complete-test";

function buildState(opts: {
	correct: number;
	incorrect?: number;
	durationMs: number;
	startTime?: number;
}) {
	const total = opts.correct + (opts.incorrect ?? 0);
	const text = "x".repeat(total);
	const state = createTypingState(text, {
		startTime: opts.startTime ?? 1_000_000,
		endTime: (opts.startTime ?? 1_000_000) + opts.durationMs,
	});
	const chars = state.words.flatMap((w) => w.characters);
	for (let i = 0; i < opts.correct; i++) {
		const char = chars[i];
		Object.assign(char, createCorrectChar(char.expected));
	}
	for (let i = 0; i < (opts.incorrect ?? 0); i++) {
		const char = chars[opts.correct + i];
		Object.assign(char, createIncorrectChar(char.expected, "z"));
	}
	return state;
}

describe("completeTest", () => {
	it("returns zero metrics when nothing was typed", () => {
		const state = createTypingState("hello world");
		const out = completeTest(state);
		expect(out.result.wpm).toBe(0);
		expect(out.result.rawWpm).toBe(0);
		expect(out.result.accuracy).toBe(100); // accuracy defaults to 100 when nothing typed
		expect(out.result.elapsed).toBe(0);
		expect(out.charCount).toBe(11);
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
		const state = buildState({
			correct: 25,
			durationMs: 30_000,
			startTime: 1_000_000,
		});
		const out = completeTest(state);
		expect(Array.isArray(out.result.wpmPerSecond)).toBe(true);
	});
});
