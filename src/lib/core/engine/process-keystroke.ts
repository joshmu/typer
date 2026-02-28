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
	// Ignore modifier/function/navigation keys
	if (isIgnoredKey(key)) return state;

	// Test already complete — ignore all input
	if (state.endTime !== null) return state;

	const { currentWordIndex, currentCharIndex, words } = state;
	const currentWord = words[currentWordIndex];

	// Handle backspace
	if (key === "Backspace") {
		return handleBackspace(state);
	}

	// No current word (shouldn't happen but guard)
	if (!currentWord) return state;

	const currentChar = currentWord.characters[currentCharIndex];
	if (!currentChar) return state;

	// Determine if correct
	const isCorrect = key === currentChar.expected;

	// Stop on error: letter mode — don't advance on incorrect
	if (state.config.stopOnError === "letter" && !isCorrect) {
		const newWords = cloneWords(words);
		newWords[currentWordIndex].characters[currentCharIndex] = {
			...currentChar,
			typed: key,
			status: "incorrect",
			timestamp,
		};
		return {
			...state,
			words: newWords,
			startTime: state.startTime ?? timestamp,
		};
	}

	// Update the character
	const newWords = cloneWords(words);
	newWords[currentWordIndex].characters[currentCharIndex] = {
		...currentChar,
		typed: key,
		status: isCorrect ? "correct" : "incorrect",
		timestamp,
	};

	// Advance cursor
	let nextWordIndex = currentWordIndex;
	let nextCharIndex = currentCharIndex + 1;

	// Check if we've finished the current word
	if (nextCharIndex >= currentWord.characters.length) {
		// Check if we've finished the entire test
		if (nextWordIndex >= words.length - 1) {
			// Test complete
			newWords[currentWordIndex].isActive = false;
			return {
				...state,
				words: newWords,
				currentWordIndex: nextWordIndex,
				currentCharIndex: nextCharIndex,
				startTime: state.startTime ?? timestamp,
				endTime: timestamp,
			};
		}
		// Move to next word
		newWords[currentWordIndex].isActive = false;
		nextWordIndex++;
		nextCharIndex = 0;
		newWords[nextWordIndex].isActive = true;
	}

	return {
		...state,
		words: newWords,
		currentWordIndex: nextWordIndex,
		currentCharIndex: nextCharIndex,
		startTime: state.startTime ?? timestamp,
	};
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
