import { describe, expect, it } from "vitest";
import { createTypingState } from "../types/test-fixtures";
import { applyKeystroke } from "./process-keystroke";
import { deriveResultInsights } from "./result-insights";

describe("deriveResultInsights", () => {
	it("carries the mode, time, AFK verdict and per-second detail", () => {
		const state = createTypingState("ab", {
			mode: { type: "time", seconds: 15 },
			startTime: 1_000,
			endTime: 16_000,
		});
		const [a] = state.words[0].characters;
		a.status = "correct";
		a.typed = "a";
		a.timestamp = 1_200;

		const insights = deriveResultInsights(state, 15_000, 99);

		expect(insights.mode).toEqual({ type: "time", seconds: 15 });
		expect(insights.timestamp).toBe(99);
		expect(insights.afk).toBe(true);
		expect(insights.rawPerSecond).toHaveLength(15);
		expect(insights.errorsPerSecond).toHaveLength(15);
	});

	it("charts keys whose characters were erased", () => {
		const state = createTypingState("abc", {
			mode: { type: "time", seconds: 15 },
		});
		for (const [key, at] of [
			["a", 1_000],
			["x", 1_200],
			["Backspace", 1_300],
			["x", 2_100],
			["Backspace", 2_200],
		] as const) {
			applyKeystroke(state, key, at);
		}
		state.endTime = 16_000;

		const insights = deriveResultInsights(state, 15_000, 99);

		// 2 keys in the first second = 24 WPM, 1 in the second = 12 WPM
		expect(insights.rawPerSecond.slice(0, 3)).toEqual([24, 12, 0]);
		expect(insights.errorsPerSecond.slice(0, 3)).toEqual([1, 1, 0]);
	});
});
