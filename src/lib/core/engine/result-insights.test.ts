import { describe, expect, it } from "vitest";
import { createTypingState } from "../types/test-fixtures";
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
});
