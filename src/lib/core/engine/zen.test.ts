import { describe, expect, it } from "vitest";
import { textToWords } from "../text/normalizer";
import type { TypingState } from "../types";
import { createTestConfig } from "../types/test-fixtures";
import { appendWordsToState, needsMoreWords } from "./zen";

function createZenState(text: string, currentWordIndex: number): TypingState {
	const words = textToWords(text);
	if (words.length > 0) words[0].isActive = true;
	return {
		text,
		words,
		currentWordIndex,
		currentCharIndex: 0,
		startTime: Date.now(),
		endTime: null,
		mode: { type: "zen" },
		config: createTestConfig(),
	};
}

describe("needsMoreWords", () => {
	it("returns true when user is within 5 words of the end", () => {
		const state = createZenState("a b c d e f g h i j", 6);
		expect(needsMoreWords(state)).toBe(true);
	});

	it("returns false when user has plenty of words ahead", () => {
		const state = createZenState("a b c d e f g h i j", 2);
		expect(needsMoreWords(state)).toBe(false);
	});

	it("returns true when at the last word", () => {
		const state = createZenState("a b c", 2);
		expect(needsMoreWords(state)).toBe(true);
	});

	it("returns false for non-zen modes", () => {
		const state = createZenState("a b c", 2);
		state.mode = { type: "custom" };
		expect(needsMoreWords(state)).toBe(false);
	});
});

describe("appendWordsToState", () => {
	it("adds new words to the state", () => {
		const state = createZenState("hello world", 0);
		const originalLength = state.words.length;

		const updated = appendWordsToState(state, "foo bar baz");

		expect(updated.words.length).toBe(originalLength + 3);
		expect(updated.text).toBe("hello world foo bar baz");
	});

	it("preserves existing word states", () => {
		const state = createZenState("hello world", 0);
		state.words[0].characters[0].status = "correct";
		state.words[0].characters[0].typed = "h";

		const updated = appendWordsToState(state, "foo");

		expect(updated.words[0].characters[0].status).toBe("correct");
		expect(updated.words[0].characters[0].typed).toBe("h");
	});

	it("does not change cursor position", () => {
		const state = createZenState("hello world", 1);
		state.currentCharIndex = 3;

		const updated = appendWordsToState(state, "foo");

		expect(updated.currentWordIndex).toBe(1);
		expect(updated.currentCharIndex).toBe(3);
	});

	it("appends trailing space to last existing word before new words", () => {
		const state = createZenState("hello", 0);
		// "hello" has no trailing space (it's the last word)
		const lastWordChars = state.words[state.words.length - 1].characters;
		const lastCharExpected = lastWordChars[lastWordChars.length - 1].expected;
		expect(lastCharExpected).not.toBe(" ");

		const updated = appendWordsToState(state, "world");

		// After appending, the previously-last word should now have a trailing space
		const prevLastWord = updated.words[0];
		const prevLastChar =
			prevLastWord.characters[prevLastWord.characters.length - 1];
		expect(prevLastChar.expected).toBe(" ");
	});
});
