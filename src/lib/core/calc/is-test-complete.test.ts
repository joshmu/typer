import { describe, expect, it } from "vitest";
import { processKeystroke } from "../engine/process-keystroke";
import { createTypingState } from "../types/test-fixtures";
import { isTestComplete } from "./is-test-complete";

describe("isTestComplete", () => {
	it("returns false for fresh state", () => {
		const state = createTypingState("hello");
		expect(isTestComplete(state)).toBe(false);
	});

	it("returns true when endTime is set", () => {
		let state = createTypingState("ab");
		state = processKeystroke(state, "a", 1000);
		state = processKeystroke(state, "b", 1001);
		expect(isTestComplete(state)).toBe(true);
	});

	it("returns false when partially typed", () => {
		let state = createTypingState("abc");
		state = processKeystroke(state, "a", 1000);
		expect(isTestComplete(state)).toBe(false);
	});
});
