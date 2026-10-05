export type CharacterStatus =
	| "pending"
	| "correct"
	| "incorrect"
	| "extra"
	| "missed";

/** What a keystroke did; null when it changed nothing. */
export type KeyOutcome = "correct" | "incorrect" | "backspace" | null;

export interface CharacterState {
	expected: string;
	typed: string | null;
	status: CharacterStatus;
	timestamp: number | null;
	mistakeCount: number;
}

export interface WordState {
	characters: CharacterState[];
	isActive: boolean;
}

export type TestMode =
	| { type: "time"; seconds: 15 | 30 | 60 | 120 }
	| { type: "words"; count: 10 | 25 | 50 | 100 }
	| { type: "quote"; length: "short" | "medium" | "long" }
	| { type: "custom" }
	| { type: "zen" }
	| { type: "book"; bookId: string; chapterIndex: number };

export type StopOnError = "off" | "word" | "letter";

export interface TestConfig {
	punctuation: boolean;
	numbers: boolean;
	language: string;
	stopOnError: StopOnError;
}

/** When character keys landed, kept when their characters are erased. */
export interface KeyActivity {
	/** Time of the last character key, null before the first. */
	lastAt: number | null;
	/** Character keys, right or wrong, in each whole second from the start. */
	keysPerSecond: number[];
	/** Mistyped character keys in each whole second, same length as keysPerSecond. */
	errorsPerSecond: number[];
}

/** Character keys pressed this test, kept even when later corrected. */
export interface KeystrokeCounts {
	correct: number;
	incorrect: number;
}

export interface TypingState {
	text: string;
	words: WordState[];
	currentWordIndex: number;
	currentCharIndex: number;
	startTime: number | null;
	endTime: number | null;
	keystrokes: KeystrokeCounts;
	activity: KeyActivity;
	mode: TestMode;
	config: TestConfig;
}

/** Source a continuous mode refills its text from. */
export interface Feed {
	/** The next `count` words as a space-separated string, "" once exhausted. */
	next(count: number): string;
	readonly exhausted: boolean;
}
