import { textToCharacters, textToWords } from "../text/normalizer";
import type { TypingState } from "../types";

const LOOK_AHEAD = 5;

/**
 * Returns true when the user is within LOOK_AHEAD words of the end in a
 * mode that refills as you type (time, zen, book).
 */
export function needsMoreWords(state: TypingState): boolean {
	const { type } = state.mode;
	if (type !== "time" && type !== "zen" && type !== "book") return false;
	return state.words.length - state.currentWordIndex <= LOOK_AHEAD;
}

/**
 * Append words to the state in place, preserving existing word/character
 * states and the cursor.
 */
export function appendWords(state: TypingState, newText: string): void {
	const newWords = textToWords(newText);
	if (newWords.length === 0) return;

	// The last existing word has no trailing space — add one
	const lastWord = state.words[state.words.length - 1];
	const lastChar = lastWord?.characters[lastWord.characters.length - 1];
	if (lastChar && lastChar.expected !== " ") {
		lastWord.characters.push(...textToCharacters(" "));
	}

	state.text = `${state.text} ${newText}`;
	state.words.push(...newWords);
}
