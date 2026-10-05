import { describe, expect, it } from "vitest";
import { applyKeystroke } from "../engine/process-keystroke";
import { createCharState, createTypingState } from "../types/test-fixtures";
import { calculateCharBreakdown } from "./breakdown";

function typed(text: string, keys: string[]) {
	const state = createTypingState(text, {
		mode: { type: "time", seconds: 15 },
	});
	keys.forEach((key, i) => {
		applyKeystroke(state, key, 1000 + i);
	});
	return state;
}

describe("calculateCharBreakdown", () => {
	it("counts correct and incorrect characters", () => {
		const result = calculateCharBreakdown(typed("abc", ["a", "b", "x"]));
		expect(result).toEqual({
			correct: 2,
			incorrect: 1,
			missed: 0,
			extra: 0,
			total: 3,
		});
	});

	it("never counts untyped text after the cursor as missed", () => {
		const state = typed("the quick brown fox jumps", ["t", "h", "x"]);
		const result = calculateCharBreakdown(state);
		expect(result.missed).toBe(0);
		expect(result.total).toBe(3);
	});

	it("is empty before anything is typed", () => {
		expect(calculateCharBreakdown(typed("hello world", []))).toEqual({
			correct: 0,
			incorrect: 0,
			missed: 0,
			extra: 0,
			total: 0,
		});
	});

	it("does not count backspaced characters", () => {
		const state = typed("abc", ["a", "b", "Backspace"]);
		expect(calculateCharBreakdown(state)).toMatchObject({
			correct: 1,
			missed: 0,
			total: 1,
		});
	});

	it("counts untyped characters in words already passed as missed", () => {
		const state = createTypingState("abc de");
		const [a, b, c, space] = state.words[0].characters;
		Object.assign(a, { typed: "a", status: "correct" });
		Object.assign(space, { typed: " ", status: "correct" });
		expect(b.status).toBe("pending");
		expect(c.status).toBe("pending");
		state.words[0].isActive = false;
		state.words[1].isActive = true;
		state.currentWordIndex = 1;
		state.currentCharIndex = 0;

		const result = calculateCharBreakdown(state);
		expect(result.missed).toBe(2);
		expect(result.total).toBe(4);
	});

	it("counts characters marked missed and extra", () => {
		const state = createTypingState("ab");
		state.words[0].characters = [
			createCharState({ expected: "a", typed: "a", status: "correct" }),
			createCharState({ expected: "b", status: "missed" }),
			createCharState({ expected: "", typed: "x", status: "extra" }),
		];
		state.currentCharIndex = 3;
		expect(calculateCharBreakdown(state)).toEqual({
			correct: 1,
			incorrect: 0,
			missed: 1,
			extra: 1,
			total: 3,
		});
	});

	it("counts the whole text once every word is typed", () => {
		const state = typed("ab c", ["a", "b", " ", "c"]);
		expect(calculateCharBreakdown(state)).toMatchObject({
			correct: 4,
			total: 4,
		});
	});
});
