import { describe, expect, it } from "vitest";
import { calculateWPM } from "@/lib/core/calc";
import { createCorrectChar } from "@/lib/core/types/test-fixtures";
import { deriveRunStats } from "./run-stats";
import { createInitialState, type GameState } from "./state";

function stateWith(overrides: Partial<GameState>): GameState {
	return { ...createInitialState(42), ...overrides };
}

describe("deriveRunStats", () => {
	it("passes through score, wave, and kills", () => {
		const stats = deriveRunStats(
			stateWith({ score: 1234, wave: 5, kills: 17 }),
		);
		expect(stats.score).toBe(1234);
		expect(stats.wave).toBe(5);
		expect(stats.kills).toBe(17);
	});

	it("derives duration from tick at 60fps", () => {
		expect(deriveRunStats(stateWith({ tick: 0 })).durationSeconds).toBe(0);
		expect(deriveRunStats(stateWith({ tick: 3600 })).durationSeconds).toBe(60);
		expect(deriveRunStats(stateWith({ tick: 90 })).durationSeconds).toBe(1.5);
	});

	it("reports 100% accuracy when no keys were pressed", () => {
		expect(deriveRunStats(stateWith({ hits: 0, misses: 0 })).accuracy).toBe(
			100,
		);
	});

	it("computes accuracy as hits / (hits + misses) * 100", () => {
		expect(deriveRunStats(stateWith({ hits: 90, misses: 10 })).accuracy).toBe(
			90,
		);
		expect(deriveRunStats(stateWith({ hits: 3, misses: 1 })).accuracy).toBe(75);
	});

	it("reports 0 WPM when no time has elapsed", () => {
		expect(deriveRunStats(stateWith({ tick: 0, hits: 25 })).wpm).toBe(0);
	});

	it("computes WPM matching core calculateWPM (chars/5 per minute)", () => {
		// 300 hits over 60s → 300/5 words / 1 min = 60 wpm
		const stats = deriveRunStats(stateWith({ tick: 3600, hits: 300 }));
		expect(stats.wpm).toBe(60);

		const correctChars = Array.from({ length: 300 }, () =>
			createCorrectChar("a"),
		);
		expect(stats.wpm).toBe(calculateWPM(correctChars, 60_000));
	});

	it("rounds WPM to an integer", () => {
		// 100 hits over 30s → (100/5) / 0.5 min = 40 wpm
		expect(deriveRunStats(stateWith({ tick: 1800, hits: 100 })).wpm).toBe(40);
	});
});
