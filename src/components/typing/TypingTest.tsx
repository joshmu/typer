import { Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { createStore, produce } from "solid-js/store";
import {
	calculateAccuracy,
	calculateWPM,
	isTestComplete,
} from "@/lib/core/calc";
import { processKeystroke } from "@/lib/core/engine/process-keystroke";
import { appendWordsToState, needsMoreWords } from "@/lib/core/engine/zen";
import { normalizeText, textToWords } from "@/lib/core/text/normalizer";
import { generateWords } from "@/lib/core/text/words";
import type { StopOnError, TestMode, TypingState } from "@/lib/core/types";
import {
	createTestConfig,
	createTestMode,
} from "@/lib/core/types/test-fixtures";
import StatsBar from "./StatsBar";
import TextDisplay from "./TextDisplay";

interface TypingTestProps {
	text: string;
	mode?: TestMode;
	stopOnError?: StopOnError;
	onComplete?: (state: TypingState) => void;
}

function initState(
	text: string,
	mode?: TestMode,
	stopOnError?: StopOnError,
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
		mode: mode ?? createTestMode(),
		config: createTestConfig({ stopOnError: stopOnError ?? "off" }),
	};
}

export default function TypingTest(props: TypingTestProps) {
	const [state, setState] = createStore<TypingState>(
		initState(props.text, props.mode, props.stopOnError),
	);
	const [elapsed, setElapsed] = createSignal(0);
	const [capsLock, setCapsLock] = createSignal(false);
	let containerRef: HTMLDivElement | undefined;
	let timerInterval: ReturnType<typeof setInterval> | undefined;

	const wpm = createMemo(() => {
		const e = elapsed();
		if (e === 0 || !state.startTime) return 0;
		const chars = state.words.flatMap((w) => w.characters);
		return calculateWPM(chars, e);
	});

	const accuracy = createMemo(() => {
		const chars = state.words.flatMap((w) => w.characters);
		return calculateAccuracy(chars);
	});

	const complete = createMemo(() => {
		if (state.mode.type === "zen") return state.endTime !== null;
		return isTestComplete(state);
	});

	function startTimer() {
		if (timerInterval) return;
		timerInterval = setInterval(() => {
			if (state.startTime) {
				setElapsed(Date.now() - state.startTime);
			}
		}, 100);
	}

	function stopTimer() {
		if (timerInterval) {
			clearInterval(timerInterval);
			timerInterval = undefined;
		}
	}

	function finishZen() {
		const now = Date.now();
		setState("endTime", now);
		stopTimer();
		if (state.startTime) {
			setElapsed(now - state.startTime);
		}
		props.onComplete?.(state);
	}

	function handleKeydown(e: KeyboardEvent) {
		// Detect Caps Lock state
		setCapsLock(e.getModifierState("CapsLock"));

		if (complete()) return;

		const key = e.key;

		// Zen mode: Escape finishes the test
		if (key === "Escape" && state.mode.type === "zen" && state.startTime) {
			e.preventDefault();
			finishZen();
			return;
		}

		// Tab+Enter restarts if test hasn't started
		if (key === "Tab" && !state.startTime) {
			e.preventDefault();
			return;
		}

		// Don't prevent browser shortcuts
		if (e.ctrlKey || e.metaKey || e.altKey) return;

		// Prevent default for typing keys
		if (key.length === 1 || key === "Backspace") {
			e.preventDefault();
		}

		const timestamp = Date.now();
		const wasStarted = state.startTime !== null;

		setState(
			produce((s) => {
				const next = processKeystroke(s, key, timestamp);
				Object.assign(s, next);
			}),
		);

		if (!wasStarted && state.startTime !== null) {
			startTimer();
		}

		// Zen mode: append more words when running low
		if (state.mode.type === "zen" && needsMoreWords(state)) {
			const newText = generateWords(20);
			setState(
				produce((s) => {
					const updated = appendWordsToState(s, newText);
					Object.assign(s, updated);
				}),
			);
		}

		if (state.mode.type !== "zen" && isTestComplete(state)) {
			stopTimer();
			if (state.startTime && state.endTime) {
				setElapsed(state.endTime - state.startTime);
			}
			props.onComplete?.(state);
		}
	}

	onMount(() => {
		containerRef?.focus();
	});

	onCleanup(() => {
		stopTimer();
	});

	return (
		<div
			ref={containerRef}
			class="outline-none w-full max-w-4xl mx-auto"
			role="application"
			aria-label="Typing test area"
			tabIndex={0}
			onKeyDown={handleKeydown}
			data-testid="typing-test"
		>
			<StatsBar wpm={wpm()} accuracy={accuracy()} elapsed={elapsed()} />
			<Show when={capsLock() && !complete()}>
				<div class="mb-2 text-sm text-error flex items-center gap-2">
					<span class="w-2 h-2 rounded-full bg-error" />
					Caps Lock is on
				</div>
			</Show>
			<Show when={state.mode.type === "zen" && !complete() && state.startTime}>
				<div class="mb-2 text-xs text-text-sub">
					Press <kbd class="px-1 py-0.5 bg-bg-secondary rounded text-text">Esc</kbd> to finish
				</div>
			</Show>
			<TextDisplay
				words={state.words}
				currentWordIndex={state.currentWordIndex}
				currentCharIndex={state.currentCharIndex}
			/>
			{complete() && (
				<div class="mt-8 text-center">
					<p class="text-2xl text-primary mb-2">{wpm()} WPM</p>
					<p class="text-text-sub mb-4">{accuracy()}% accuracy</p>
				</div>
			)}
		</div>
	);
}
