import { Match, Show, Switch, createSignal } from "solid-js";
import ResultsScreen from "@/components/results/ResultsScreen";
import ModeSelector from "@/components/typing/ModeSelector";
import TextInputModal from "@/components/typing/TextInputModal";
import TypingTest from "@/components/typing/TypingTest";
import {
	calculateAccuracy,
	calculateCharBreakdown,
	calculateConsistency,
	calculateWPM,
	collectPerSecondWPM,
} from "@/lib/core/calc";
import { getRandomQuote } from "@/lib/core/text/quotes";
import { generateWords } from "@/lib/core/text/words";
import type { TestMode, TypingState } from "@/lib/core/types";
import { db } from "@/lib/db";

interface TestResult {
	wpm: number;
	rawWpm: number;
	accuracy: number;
	consistency: number;
	breakdown: ReturnType<typeof calculateCharBreakdown>;
	elapsed: number;
	wpmPerSecond: number[];
}

export default function Home() {
	const [mode, setMode] = createSignal<TestMode>({ type: "custom" });
	const [text, setText] = createSignal<string | null>(null);
	const [result, setResult] = createSignal<TestResult | null>(null);

	function startWithMode(newMode: TestMode) {
		setMode(newMode);
		setResult(null);

		switch (newMode.type) {
			case "time":
				setText(generateWords(200));
				break;
			case "words":
				setText(generateWords(newMode.count));
				break;
			case "quote": {
				const quote = getRandomQuote(newMode.length);
				setText(quote.text);
				break;
			}
			case "custom":
				setText(null);
				break;
		}
	}

	function handleModeChange(newMode: TestMode) {
		startWithMode(newMode);
	}

	function handleComplete(state: TypingState) {
		const chars = state.words.flatMap((w) => w.characters);
		const elapsed =
			state.startTime && state.endTime
				? state.endTime - state.startTime
				: 0;

		const wpm = calculateWPM(chars, elapsed);
		const rawWpm = calculateWPM(chars, elapsed);
		const accuracy = calculateAccuracy(chars);
		const snapshots = collectPerSecondWPM(chars, state.startTime ?? 0);
		const consistency = calculateConsistency(snapshots);
		const breakdown = calculateCharBreakdown(chars);

		const testResult: TestResult = {
			wpm,
			rawWpm,
			accuracy,
			consistency,
			breakdown,
			elapsed,
			wpmPerSecond: snapshots,
		};

		setResult(testResult);

		db.results.add({
			mode: state.mode.type,
			wpm,
			rawWpm,
			accuracy,
			consistency,
			duration: Math.floor(elapsed / 1000),
			charCount: breakdown.total,
			errorCount: breakdown.incorrect + breakdown.extra,
			timestamp: Date.now(),
			textHash: simpleHash(state.text),
		});
	}

	function handleRedo() {
		setResult(null);
		if (mode().type !== "custom") {
			startWithMode(mode());
		} else {
			setText(null);
		}
	}

	return (
		<main class="flex flex-col items-center justify-center flex-1 px-8 py-12">
			<Show when={!result() && !text()}>
				<ModeSelector mode={mode()} onModeChange={handleModeChange} />
			</Show>

			<Switch>
				<Match when={result()}>
					{(r) => (
						<ResultsScreen
							wpm={r().wpm}
							rawWpm={r().rawWpm}
							accuracy={r().accuracy}
							consistency={r().consistency}
							breakdown={r().breakdown}
							elapsed={r().elapsed}
							wpmPerSecond={r().wpmPerSecond}
							onRedo={handleRedo}
						/>
					)}
				</Match>
				<Match when={text()}>
					{(t) => (
						<TypingTest
							text={t()}
							onComplete={handleComplete}
						/>
					)}
				</Match>
				<Match when={mode().type === "custom" && !text()}>
					<TextInputModal onSubmit={(t) => setText(t)} />
				</Match>
			</Switch>
		</main>
	);
}

function simpleHash(str: string): string {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash |= 0;
	}
	return hash.toString(36);
}
