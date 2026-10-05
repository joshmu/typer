import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { calculateAccuracy, calculateWPM } from "@/lib/core/calc";
import {
	createTypingSession,
	initTypingState,
} from "@/lib/core/engine/typing-session";
import type {
	Feed,
	StopOnError,
	TestMode,
	TypingState,
} from "@/lib/core/types";
import { keySoundFor } from "@/lib/key-sound";
import { usePreferences } from "@/lib/preferences-context";
import { setTypingActive } from "@/lib/typing-focus";
import StatsBar from "./StatsBar";
import TextDisplay, { type TextDisplayHandle } from "./TextDisplay";

interface TypingTestProps {
	text: string;
	mode?: TestMode;
	stopOnError?: StopOnError;
	onComplete?: (state: TypingState) => void;
	/** Source the test refills from */
	feed?: Feed;
}

export default function TypingTest(props: TypingTestProps) {
	const [state, setState] = createStore<TypingState>(
		initTypingState(
			props.text,
			props.mode ?? { type: "custom" },
			props.stopOnError ?? "off",
		),
	);
	const [prefs] = usePreferences();
	const keySound = keySoundFor(prefs.keySound);
	const [elapsed, setElapsed] = createSignal(0);
	const [capsLock, setCapsLock] = createSignal(false);
	let containerRef: HTMLDivElement | undefined;
	let display: TextDisplayHandle | undefined;
	let timerInterval: ReturnType<typeof setInterval> | undefined;
	let deadlineTimer: ReturnType<typeof setTimeout> | undefined;

	const wpm = createMemo(() => {
		const e = elapsed();
		if (e === 0 || !state.startTime) return 0;
		const chars = state.words.flatMap((w) => w.characters);
		return calculateWPM(chars, e);
	});

	const accuracy = createMemo(() => calculateAccuracy(state.keystrokes));

	const isContinuousMode =
		state.mode.type === "zen" || state.mode.type === "book";

	const complete = () => state.endTime !== null;
	const showEscHint = () =>
		isContinuousMode && !complete() && state.startTime !== null;

	const session = createTypingSession({
		state,
		feed: props.feed,
		write: (mutate) => setState(produce(mutate)),
		onComplete: (s) => {
			stopTimers();
			if (s.startTime !== null && s.endTime !== null) {
				setElapsed(s.endTime - s.startTime);
			}
			props.onComplete?.(s);
		},
	});

	function startTimers() {
		timerInterval = setInterval(() => {
			if (state.startTime) setElapsed(Date.now() - state.startTime);
		}, 100);
		armDeadline();
	}

	function armDeadline() {
		const deadline = session.deadline();
		if (deadline === null) return;
		deadlineTimer = setTimeout(
			() => {
				session.tick(Date.now());
				if (!session.complete) armDeadline();
			},
			Math.max(0, deadline - Date.now()),
		);
	}

	function stopTimers() {
		clearInterval(timerInterval);
		clearTimeout(deadlineTimer);
	}

	function handleKeydown(e: KeyboardEvent) {
		// Detect Caps Lock state
		setCapsLock(e.getModifierState("CapsLock"));

		if (complete()) return;

		const key = e.key;

		if (key === "Escape" && isContinuousMode) e.preventDefault();

		// Keep focus in the typing area before the test starts; Shift+Tab
		// still leaves for the controls around it.
		if (key === "Tab" && !e.shiftKey && !state.startTime) {
			e.preventDefault();
			return;
		}

		// Don't prevent browser shortcuts
		if (e.ctrlKey || e.metaKey || e.altKey) return;

		// Prevent default for typing keys
		if (key.length === 1 || key === "Backspace") {
			e.preventDefault();
		}

		const wasStarted = state.startTime !== null;
		const wordIndex = state.currentWordIndex;
		const outcome = session.key(key, Date.now());
		if (outcome) keySound.play(outcome !== "incorrect");
		if (outcome === "incorrect") display?.miss(wordIndex);

		if (!wasStarted && state.startTime !== null && !complete()) {
			startTimers();
			setTypingActive(true);
		}
	}

	onMount(() => {
		containerRef?.focus();
		const warm = setTimeout(() => keySound.warm(), 0);
		onCleanup(() => clearTimeout(warm));
	});

	onCleanup(() => {
		stopTimers();
		setTypingActive(false);
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
			<StatsBar
				wpm={wpm()}
				accuracy={accuracy()}
				elapsed={elapsed()}
				typed={state.keystrokes.correct + state.keystrokes.incorrect}
			/>
			{/* One reserved row for the Caps Lock warning and the Esc hint, so
			    neither shifts the text when it appears. */}
			<div class="mb-2 flex h-5 items-center text-xs">
				<Show
					when={capsLock() && !complete()}
					fallback={
						<div
							class="text-text-sub transition-opacity duration-300"
							classList={{ "opacity-0": !showEscHint() }}
							aria-hidden={!showEscHint()}
						>
							Press{" "}
							<kbd class="rounded bg-bg-secondary px-1 py-0.5 text-text">
								Esc
							</kbd>{" "}
							to {state.mode.type === "book" ? "stop & save" : "finish"}
						</div>
					}
				>
					<div class="flex items-center gap-2 text-sm text-error">
						<span class="h-2 w-2 rounded-full bg-error" />
						Caps Lock is on
					</div>
				</Show>
			</div>
			<TextDisplay
				words={state.words}
				currentWordIndex={state.currentWordIndex}
				currentCharIndex={state.currentCharIndex}
				handle={(h) => {
					display = h;
				}}
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
