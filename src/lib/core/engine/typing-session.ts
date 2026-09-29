import { normalizeText, textToWords } from "../text/normalizer";
import type {
	Feed,
	KeyOutcome,
	StopOnError,
	TestMode,
	TypingState,
} from "../types";
import { applyKeystroke } from "./process-keystroke";
import { appendWords, needsMoreWords } from "./zen";

const REFILL_WORD_COUNT = 20;

export interface TypingSessionOptions {
	state: TypingState;
	/** Source a continuous mode refills from. */
	feed?: Feed;
	/**
	 * Runs `mutate` against the state. Defaults to mutating `state` directly;
	 * a UI store passes its own setter so only the touched paths update.
	 */
	write?: (mutate: (draft: TypingState) => void) => void;
	onComplete?: (state: TypingState) => void;
}

export interface TypingSession {
	/** Handle a key pressed at time `now`; null when it changed nothing. */
	key(key: string, now: number): KeyOutcome;
	/** Advance the clock to `now`; a time test ends at its limit. */
	tick(now: number): void;
	/** When the time limit ends the test, once it has started. */
	deadline(): number | null;
	readonly complete: boolean;
}

export function initTypingState(
	text: string,
	mode: TestMode,
	stopOnError: StopOnError,
): TypingState {
	const normalized = normalizeText(text);
	const words = textToWords(normalized);
	if (words.length > 0) words[0].isActive = true;
	return {
		text: normalized,
		words,
		currentWordIndex: 0,
		currentCharIndex: 0,
		startTime: null,
		endTime: null,
		mode,
		config: {
			punctuation: false,
			numbers: false,
			language: "english",
			stopOnError,
		},
	};
}

function isContinuous(mode: TestMode): boolean {
	return mode.type === "zen" || mode.type === "book";
}

/**
 * Owns one test from first key to completion: the keystroke fold, each mode's
 * end rule and continuous refill. Time comes in as arguments, never a clock.
 */
export function createTypingSession(
	options: TypingSessionOptions,
): TypingSession {
	const { state, feed, onComplete } = options;
	const write = options.write ?? ((mutate) => mutate(state));
	let complete = false;

	function end(endTime: number) {
		if (complete) return;
		complete = true;
		if (state.endTime === null) {
			write((s) => {
				s.endTime = endTime;
			});
		}
		onComplete?.(state);
	}

	function deadline(): number | null {
		if (state.mode.type !== "time" || state.startTime === null) return null;
		return state.startTime + state.mode.seconds * 1000;
	}

	function tick(now: number) {
		const limit = deadline();
		if (limit !== null && now >= limit) end(limit);
	}

	function key(key: string, now: number): KeyOutcome {
		if (complete) return null;
		tick(now);
		if (complete) return null;

		if (key === "Escape") {
			if (isContinuous(state.mode) && state.startTime !== null) end(now);
			return null;
		}

		let outcome: KeyOutcome = null;
		write((s) => {
			outcome = applyKeystroke(s, key, now);
			if (feed && s.endTime === null && needsMoreWords(s)) {
				const more = feed.next(REFILL_WORD_COUNT);
				if (more) appendWords(s, more);
			}
		});

		if (state.endTime !== null) end(state.endTime);
		return outcome;
	}

	return {
		key,
		tick,
		deadline,
		get complete() {
			return complete;
		},
	};
}
