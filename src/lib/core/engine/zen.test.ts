import { describe, expect, it } from "vitest";
import { textToWords } from "../text/normalizer";
import type { TypingState } from "../types";
import { createTestConfig } from "../types/test-fixtures";
import { appendWords, needsMoreWords } from "./zen";

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
		keystrokes: { correct: 0, incorrect: 0 },
		activity: { lastAt: null },
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

	it("returns true for time mode", () => {
		const state = createZenState("a b c", 2);
		state.mode = { type: "time", seconds: 30 };
		expect(needsMoreWords(state)).toBe(true);
	});

	it("returns false for non-zen modes", () => {
		const state = createZenState("a b c", 2);
		state.mode = { type: "custom" };
		expect(needsMoreWords(state)).toBe(false);
	});
});

describe("appendWords", () => {
	it("adds new words to the state", () => {
		const state = createZenState("hello world", 0);
		const originalLength = state.words.length;

		appendWords(state, "foo bar baz");

		expect(state.words.length).toBe(originalLength + 3);
		expect(state.text).toBe("hello world foo bar baz");
	});

	it("appends in place, keeping the words array and existing words", () => {
		const state = createZenState("hello world", 0);
		const words = state.words;
		const first = words[0];

		appendWords(state, "foo");

		expect(state.words).toBe(words);
		expect(state.words[0]).toBe(first);
	});

	it("preserves existing word states", () => {
		const state = createZenState("hello world", 0);
		state.words[0].characters[0].status = "correct";
		state.words[0].characters[0].typed = "h";

		appendWords(state, "foo");

		expect(state.words[0].characters[0].status).toBe("correct");
		expect(state.words[0].characters[0].typed).toBe("h");
	});

	it("does not change cursor position", () => {
		const state = createZenState("hello world", 1);
		state.currentCharIndex = 3;

		appendWords(state, "foo");

		expect(state.currentWordIndex).toBe(1);
		expect(state.currentCharIndex).toBe(3);
	});

	it("appends trailing space to last existing word before new words", () => {
		const state = createZenState("hello", 0);
		// "hello" has no trailing space (it's the last word)
		const lastWordChars = state.words[state.words.length - 1].characters;
		const lastCharExpected = lastWordChars[lastWordChars.length - 1].expected;
		expect(lastCharExpected).not.toBe(" ");

		appendWords(state, "world");

		// After appending, the previously-last word should now have a trailing space
		const prevLastWord = state.words[0];
		const prevLastChar =
			prevLastWord.characters[prevLastWord.characters.length - 1];
		expect(prevLastChar.expected).toBe(" ");
	});
});
