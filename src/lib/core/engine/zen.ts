import { textToCharacters, textToWords } from "../text/normalizer";
import type { TypingState } from "../types";

const LOOK_AHEAD = 5;

/**
 * Returns true when the user is within LOOK_AHEAD words of the end
 * and the mode is zen. Used to trigger dynamic word appending.
 */
export function needsMoreWords(state: TypingState): boolean {
	if (state.mode.type !== "zen") return false;
	return state.words.length - state.currentWordIndex <= LOOK_AHEAD;
}

/**
 * Appends new words to an existing TypingState, preserving all
 * existing word/character states and cursor position.
 */
export function appendWordsToState(
	state: TypingState,
	newText: string,
): TypingState {
	const newWords = textToWords(newText);
	if (newWords.length === 0) return state;

	// Clone existing words to avoid mutation
	const existingWords = [...state.words];

	// The last existing word has no trailing space — add one
	if (existingWords.length > 0) {
		const lastWord = existingWords[existingWords.length - 1];
		const lastChar = lastWord.characters[lastWord.characters.length - 1];
		if (lastChar.expected !== " ") {
			lastWord.characters = [
				...lastWord.characters,
				...textToCharacters(" "),
			];
		}
	}

	return {
		...state,
		text: `${state.text} ${newText}`,
		words: [...existingWords, ...newWords],
	};
}
