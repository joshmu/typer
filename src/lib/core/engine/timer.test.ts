import { describe, expect, it } from "vitest";
import { createTypingState } from "../types/test-fixtures";
import { isTimedTestComplete } from "./timer";

describe("isTimedTestComplete", () => {
	it("returns false when elapsed is under time limit", () => {
		const state = createTypingState("hello");
		state.mode = { type: "time", seconds: 30 };
		expect(isTimedTestComplete(state, 15000)).toBe(false);
	});

	it("returns true when elapsed meets time limit", () => {
		const state = createTypingState("hello");
		state.mode = { type: "time", seconds: 30 };
		expect(isTimedTestComplete(state, 30000)).toBe(true);
	});

	it("returns true when elapsed exceeds time limit", () => {
		const state = createTypingState("hello");
		state.mode = { type: "time", seconds: 15 };
		expect(isTimedTestComplete(state, 20000)).toBe(true);
	});

	it("returns false for non-time modes regardless of elapsed", () => {
		const state = createTypingState("hello");
		state.mode = { type: "custom" };
		expect(isTimedTestComplete(state, 999999)).toBe(false);
	});

	it("returns false for words mode", () => {
		const state = createTypingState("hello");
		state.mode = { type: "words", count: 10 };
		expect(isTimedTestComplete(state, 999999)).toBe(false);
	});
});
