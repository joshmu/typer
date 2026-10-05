import { isCharMatch } from "../text/char-match";
import type { CharacterState, KeyOutcome, TypingState } from "../types";

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
 * Pure form of applyKeystroke: returns the next state and leaves `state`
 * untouched.
 */
export function processKeystroke(
	state: TypingState,
	key: string,
	timestamp: number,
): TypingState {
	const next: TypingState = {
		...state,
		keystrokes: { ...state.keystrokes },
		activity: {
			lastAt: state.activity.lastAt,
			seconds: [...state.activity.seconds],
			keys: [...state.activity.keys],
			errors: [...state.activity.errors],
		},
		words: state.words.map((w) => ({
			...w,
			characters: w.characters.map((c) => ({ ...c })),
		})),
	};
	applyKeystroke(next, key, timestamp);
	return next;
}

/**
 * Apply a keystroke to `state` in place. Only the current char, its word and
 * the neighbouring word are written, so a store can notify just those paths.
 * O(1) per keystroke.
 */
export function applyKeystroke(
	state: TypingState,
	key: string,
	timestamp: number,
): KeyOutcome {
	if (isIgnoredKey(key)) return null;
	if (state.endTime !== null) return null;

	if (key === "Backspace") return handleBackspace(state) ? "backspace" : null;

	const char =
		state.words[state.currentWordIndex]?.characters[state.currentCharIndex];
	if (!char) return null;

	const isCorrect = isCharMatch(key, char.expected);
	char.typed = key;
	char.status = isCorrect ? "correct" : "incorrect";
	char.timestamp = timestamp;
	if (isCorrect) state.keystrokes.correct++;
	else {
		state.keystrokes.incorrect++;
		char.mistakeCount++;
	}
	if (state.startTime === null) state.startTime = timestamp;
	recordKey(state, timestamp, isCorrect);

	// Letter mode: block cursor on incorrect unless auto-advance threshold reached
	if (
		state.config.stopOnError === "letter" &&
		!isCorrect &&
		char.mistakeCount < AUTO_ADVANCE_MISTAKE_THRESHOLD
	) {
		return "incorrect";
	}

	advanceCursor(state, timestamp);
	return isCorrect ? "correct" : "incorrect";
}

/** Counts a character key in its second. O(1): idle seconds are not stored. */
function recordKey(
	state: TypingState,
	timestamp: number,
	isCorrect: boolean,
): void {
	const activity = state.activity;
	activity.lastAt = timestamp;
	const second = Math.max(
		0,
		Math.floor((timestamp - (state.startTime ?? timestamp)) / 1000),
	);
	let last = activity.seconds.length - 1;
	if (last < 0 || second > activity.seconds[last]) {
		activity.seconds.push(second);
		activity.keys.push(0);
		activity.errors.push(0);
		last += 1;
	}
	activity.keys[last]++;
	if (!isCorrect) activity.errors[last]++;
}

function advanceCursor(state: TypingState, timestamp: number): void {
	const { currentWordIndex, words } = state;
	const currentWord = words[currentWordIndex];
	const nextCharIndex = state.currentCharIndex + 1;

	// Still within the current word
	if (nextCharIndex < currentWord.characters.length) {
		state.currentCharIndex = nextCharIndex;
		return;
	}

	// Word complete: if word mode has errors, reset the word
	if (
		state.config.stopOnError === "word" &&
		currentWord.characters.some((c) => c.status === "incorrect")
	) {
		resetWord(state, currentWordIndex);
		return;
	}

	currentWord.isActive = false;

	// Last word complete: end the test, except time mode, which ends only at
	// its limit
	if (currentWordIndex >= words.length - 1) {
		state.currentCharIndex = nextCharIndex;
		if (state.mode.type !== "time") state.endTime = timestamp;
		return;
	}

	words[currentWordIndex + 1].isActive = true;
	state.currentWordIndex = currentWordIndex + 1;
	state.currentCharIndex = 0;
}

function resetChar(char: CharacterState): void {
	char.typed = null;
	char.status = "pending";
	char.timestamp = null;
}

function resetWord(state: TypingState, wordIndex: number): void {
	for (const char of state.words[wordIndex].characters) {
		resetChar(char);
		char.mistakeCount = 0;
	}
	state.currentCharIndex = 0;
}

/** Returns false when there was nothing to delete. */
function handleBackspace(state: TypingState): boolean {
	const { currentWordIndex, currentCharIndex, words } = state;

	// In stop-on-error letter mode, the current char may be marked
	// incorrect without advancing the cursor — reset it in place
	const currentChar = words[currentWordIndex]?.characters[currentCharIndex];
	if (currentChar?.status === "incorrect" && currentChar.typed !== null) {
		resetChar(currentChar);
		return true;
	}

	// Can't backspace at the very start
	if (currentWordIndex === 0 && currentCharIndex === 0) return false;

	if (currentCharIndex > 0) {
		// Backspace within current word
		resetChar(words[currentWordIndex].characters[currentCharIndex - 1]);
		state.currentCharIndex = currentCharIndex - 1;
		return true;
	}

	// At start of word — go back to the last char of the previous word
	const prevWordIndex = currentWordIndex - 1;
	const prevWord = words[prevWordIndex];
	const prevCharIndex = prevWord.characters.length - 1;
	resetChar(prevWord.characters[prevCharIndex]);

	words[currentWordIndex].isActive = false;
	prevWord.isActive = true;
	state.currentWordIndex = prevWordIndex;
	state.currentCharIndex = prevCharIndex;
	return true;
}
