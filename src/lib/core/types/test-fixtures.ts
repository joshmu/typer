import type {
	CharacterState,
	TestConfig,
	TestMode,
	TypingState,
	WordState,
} from "./index";

export function createCharState(
	overrides: Partial<CharacterState> & { expected: string },
): CharacterState {
	return {
		typed: null,
		status: "pending",
		timestamp: null,
		...overrides,
	};
}

export function createWordState(
	text: string,
	overrides?: Partial<WordState>,
): WordState {
	return {
		characters: [...text].map((ch) => createCharState({ expected: ch })),
		isActive: false,
		...overrides,
	};
}

export function createTestConfig(overrides?: Partial<TestConfig>): TestConfig {
	return {
		punctuation: false,
		numbers: false,
		language: "english",
		stopOnError: "off",
		...overrides,
	};
}

export function createTestMode(overrides?: Partial<TestMode>): TestMode {
	return { type: "custom", ...overrides } as TestMode;
}

export function createTypingState(
	text: string,
	overrides?: Partial<TypingState>,
): TypingState {
	const words = text.split(" ");
	const wordStates = words.map((word, i) => {
		const isLast = i === words.length - 1;
		const wordText = isLast ? word : `${word} `;
		return createWordState(wordText);
	});
	if (wordStates.length > 0) {
		wordStates[0].isActive = true;
	}
	return {
		text,
		words: wordStates,
		currentWordIndex: 0,
		currentCharIndex: 0,
		startTime: null,
		endTime: null,
		mode: createTestMode(),
		config: createTestConfig(),
		...overrides,
	};
}

/** Create a CharacterState that has been correctly typed */
export function createCorrectChar(expected: string): CharacterState {
	return createCharState({
		expected,
		typed: expected,
		status: "correct",
		timestamp: Date.now(),
	});
}

/** Create a CharacterState that has been incorrectly typed */
export function createIncorrectChar(
	expected: string,
	typed: string,
): CharacterState {
	return createCharState({
		expected,
		typed,
		status: "incorrect",
		timestamp: Date.now(),
	});
}
