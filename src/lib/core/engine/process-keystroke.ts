import { isCharMatch } from "../text/char-match";
import type { TypingState } from "../types";

const IGNORED_KEYS = new Set([
	"Shift",
	"Control",
	"Alt",
	"Meta",
	"CapsLock",
	"Tab",
	"Escape",
	"Enter",
	"ArrowUp",
	"ArrowDown",
	"ArrowLeft",
	"ArrowRight",
	"Home",
	"End",
	"PageUp",
	"PageDown",
	"Insert",
	"Delete",
	"NumLock",
	"ScrollLock",
	"Pause",
	"ContextMenu",
]);

const AUTO_ADVANCE_MISTAKE_THRESHOLD = 5;

function isIgnoredKey(key: string): boolean {
	return IGNORED_KEYS.has(key) || key.startsWith("F");
}

/**
 * Pure function: process a keystroke against the current typing state.
 * Returns a new state (immutable update). O(1) per keystroke.
 */
export function processKeystroke(
	state: TypingState,
	key: string,
	timestamp: number,
): TypingState {
	if (isIgnoredKey(key)) return state;
	if (state.endTime !== null) return state;

	if (key === "Backspace") return handleBackspace(state);

	const { currentWordIndex, currentCharIndex, words } = state;
	const currentChar = words[currentWordIndex]?.characters[currentCharIndex];
	if (!currentChar) return state;

	const isCorrect = isCharMatch(key, currentChar.expected);
	const newMistakeCount = isCorrect
		? currentChar.mistakeCount
		: currentChar.mistakeCount + 1;

	const newWords = cloneWords(words);
	newWords[currentWordIndex].characters[currentCharIndex] = {
		...currentChar,
		typed: key,
		status: isCorrect ? "correct" : "incorrect",
		timestamp,
		mistakeCount: newMistakeCount,
	};

	const updated: TypingState = {
		...state,
		words: newWords,
		startTime: state.startTime ?? timestamp,
	};

	// Letter mode: block cursor on incorrect unless auto-advance threshold reached
	const isLetterMode = state.config.stopOnError === "letter";
	if (
		isLetterMode &&
		!isCorrect &&
		newMistakeCount < AUTO_ADVANCE_MISTAKE_THRESHOLD
	) {
		return updated;
	}

	return advanceCursor(updated, timestamp);
}

function advanceCursor(state: TypingState, timestamp: number): TypingState {
	const { currentWordIndex, currentCharIndex, words } = state;
	const currentWord = words[currentWordIndex];
	const nextCharIndex = currentCharIndex + 1;

	// Still within the current word
	if (nextCharIndex < currentWord.characters.length) {
		return { ...state, currentCharIndex: nextCharIndex };
	}

	// Word complete: if word mode has errors, reset the word
	if (state.config.stopOnError === "word") {
		const hasErrors = words[currentWordIndex].characters.some(
			(c) => c.status === "incorrect",
		);
		if (hasErrors) {
			return resetWord(state, currentWordIndex);
		}
	}

	// Last word complete: end test
	if (currentWordIndex >= words.length - 1) {
		words[currentWordIndex].isActive = false;
		return { ...state, currentCharIndex: nextCharIndex, endTime: timestamp };
	}

	// Move to next word
	const nextWordIndex = currentWordIndex + 1;
	words[currentWordIndex].isActive = false;
	words[nextWordIndex].isActive = true;

	return { ...state, currentWordIndex: nextWordIndex, currentCharIndex: 0 };
}

function resetWord(state: TypingState, wordIndex: number): TypingState {
	const words = state.words;
	words[wordIndex].characters = words[wordIndex].characters.map((c) => ({
		...c,
		typed: null,
		status: "pending" as const,
		timestamp: null,
		mistakeCount: 0,
	}));
	return { ...state, currentCharIndex: 0 };
}

function handleBackspace(state: TypingState): TypingState {
	const { currentWordIndex, currentCharIndex, words } = state;

	// In stop-on-error letter mode, the current char may be marked
	// incorrect without advancing the cursor — reset it in place
	const currentChar = words[currentWordIndex]?.characters[currentCharIndex];
	if (currentChar?.status === "incorrect" && currentChar.typed !== null) {
		const newWords = cloneWords(words);
		newWords[currentWordIndex].characters[currentCharIndex] = {
			...currentChar,
			typed: null,
			status: "pending",
			timestamp: null,
		};
		return { ...state, words: newWords };
	}

	// Can't backspace at the very start
	if (currentWordIndex === 0 && currentCharIndex === 0) {
		return state;
	}

	const newWords = cloneWords(words);

	if (currentCharIndex > 0) {
		// Backspace within current word
		const prevCharIndex = currentCharIndex - 1;
		newWords[currentWordIndex].characters[prevCharIndex] = {
			...newWords[currentWordIndex].characters[prevCharIndex],
			typed: null,
			status: "pending",
			timestamp: null,
		};
		return {
			...state,
			words: newWords,
			currentCharIndex: prevCharIndex,
		};
	}

	// At start of word — go back to previous word
	const prevWordIndex = currentWordIndex - 1;
	const prevWord = newWords[prevWordIndex];
	const prevCharIndex = prevWord.characters.length - 1;

	// Reset the last char of previous word
	prevWord.characters[prevCharIndex] = {
		...prevWord.characters[prevCharIndex],
		typed: null,
		status: "pending",
		timestamp: null,
	};

	// Update active word
	newWords[currentWordIndex].isActive = false;
	prevWord.isActive = true;

	return {
		...state,
		words: newWords,
		currentWordIndex: prevWordIndex,
		currentCharIndex: prevCharIndex,
	};
}

function cloneWords(words: TypingState["words"]): TypingState["words"] {
	return words.map((w) => ({
		...w,
		characters: [...w.characters],
	}));
}
