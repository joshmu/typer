import { describe, expect, it } from "vitest";
import type { TestMode, TypingState } from "../types";
import { createTypingState } from "../types/test-fixtures";
import { AFK_WINDOW_MS, isAfk } from "./afk";

const START = 10_000;

/** A finished test with its last keystroke `lastKeyMs` after the start. */
function finished(
	mode: TestMode,
	elapsedMs: number,
	lastKeyMs: number | null,
): TypingState {
	const state = createTypingState("the cat", {
		mode,
		startTime: START,
		endTime: START + elapsedMs,
	});
	if (lastKeyMs !== null) {
		const [t, h] = state.words[0].characters;
		t.status = "correct";
		t.timestamp = START;
		h.status = "correct";
		h.timestamp = START + lastKeyMs;
	}
	return state;
}

const TIME_15: TestMode = { type: "time", seconds: 15 };

describe("isAfk", () => {
	it("flags a time test with no keystroke in its last 5 seconds", () => {
		expect(isAfk(finished(TIME_15, 15_000, 9_000))).toBe(true);
	});

	it("passes a time test typed until the end", () => {
		expect(isAfk(finished(TIME_15, 15_000, 14_800))).toBe(false);
	});

	it("passes a keystroke landing exactly on the window edge", () => {
		expect(isAfk(finished(TIME_15, 15_000, 15_000 - AFK_WINDOW_MS))).toBe(
			false,
		);
	});

	it("flags a time test where only the first key was pressed", () => {
		expect(isAfk(finished(TIME_15, 15_000, 0))).toBe(true);
	});

	it("never flags modes the user ends by typing or by hand", () => {
		for (const mode of [
			{ type: "words", count: 10 },
			{ type: "quote", length: "short" },
			{ type: "zen" },
			{ type: "custom" },
			{ type: "book", bookId: "b", chapterIndex: 0 },
		] as TestMode[]) {
			expect(isAfk(finished(mode, 15_000, 1_000))).toBe(false);
		}
	});

	it("does not flag a test that never started", () => {
		const state = createTypingState("the cat", { mode: TIME_15 });
		expect(isAfk(state)).toBe(false);
	});
});
