import { createSignal, lazy, Match, Show, Switch } from "solid-js";
import ModeSelector from "@/components/typing/ModeSelector";
import { usePreferences } from "@/lib/preferences-context";

const ResultsScreen = lazy(() => import("@/components/results/ResultsScreen"));

import BookBrowser from "@/components/books/BookBrowser";
import BookHeader from "@/components/books/BookHeader";
import TextInputModal from "@/components/typing/TextInputModal";
import TypingTest from "@/components/typing/TypingTest";
import { saveBookProgress, useAllBookProgress } from "@/lib/book-progress";
import { fetchAndCacheBook } from "@/lib/book-service";
import {
	calculateAccuracy,
	calculateCharBreakdown,
	calculateConsistency,
	calculateRawWPM,
	calculateWPM,
	collectPerSecondWPM,
} from "@/lib/core/calc";
import {
	type BookFeeder,
	createBookFeeder,
} from "@/lib/core/engine/book-feeder";
import {
	computeBookResumePosition,
	countCompletedWords,
} from "@/lib/core/engine/book-resume";
import { getRandomQuote, loadExpandedQuotes } from "@/lib/core/text/quotes";
import { loadWordList } from "@/lib/core/text/word-list-loader";
import { generateWords } from "@/lib/core/text/words";
import type { TestMode, TypingState } from "@/lib/core/types";
import type { BookProgress, CachedBook } from "@/lib/core/types/book";
import type { TypingResult } from "@/lib/db";

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
	const [prefs, setPrefs] = usePreferences();

	// Eagerly load expanded quotes (fire-and-forget)
	loadExpandedQuotes();
	const [mode, setMode] = createSignal<TestMode>({
		type: "book",
		bookId: "",
		chapterIndex: 0,
	});
	const [text, setText] = createSignal<string | null>(null);
	const [result, setResult] = createSignal<TestResult | null>(null);

	// Book mode state
	const [activeBook, setActiveBook] = createSignal<CachedBook | null>(null);
	const [bookFeeder, setBookFeeder] = createSignal<BookFeeder | null>(null);
	const [bookLoading, setBookLoading] = createSignal(false);
	const [currentBookProgress, setCurrentBookProgress] =
		createSignal<BookProgress | null>(null);

	// All book progress from IndexedDB
	const allBookProgress = useAllBookProgress();

	async function startWithMode(newMode: TestMode) {
		setMode(newMode);
		setResult(null);

		switch (newMode.type) {
			case "time": {
				const wordList = await loadWordList(prefs.wordListSize);
				setText(generateWords(200, { wordList }));
				break;
			}
			case "words": {
				const wordList = await loadWordList(prefs.wordListSize);
				setText(generateWords(newMode.count, { wordList }));
				break;
			}
			case "quote": {
				const quote = getRandomQuote(newMode.length);
				setText(quote.text);
				break;
			}
			case "zen":
				setText(generateWords(30));
				break;
			case "custom":
				setText(null);
				break;
			case "book":
				// Book mode: show browser, don't set text yet
				setText(null);
				setActiveBook(null);
				setBookFeeder(null);
				break;
		}
	}

	function handleModeChange(newMode: TestMode) {
		startWithMode(newMode);
	}

	async function handleSelectBook(bookId: string, progress?: BookProgress) {
		setBookLoading(true);
		try {
			// Fetch and cache the book
			const cached = await fetchAndCacheBook(bookId);
			setActiveBook(cached);

			// Set up the feeder at the saved position or beginning
			const startChapter = progress?.chapterIndex ?? 0;
			const startWordOffset = progress?.wordOffset ?? 0;

			const feeder = createBookFeeder(
				cached.chapters,
				startChapter,
				startWordOffset,
			);

			setBookFeeder(feeder);
			setCurrentBookProgress(progress ?? null);

			// Set mode with the book info
			setMode({
				type: "book",
				bookId: cached.bookId,
				chapterIndex: startChapter,
			});

			// Get initial text from the feeder
			const initialText = feeder.getNextWords(30);
			if (initialText) {
				setText(initialText);
			}
		} catch (err) {
			console.error("Failed to load book:", err);
		} finally {
			setBookLoading(false);
		}
	}

	function handleComplete(state: TypingState) {
		const chars = state.words.flatMap((w) => w.characters);
		const elapsed =
			state.startTime && state.endTime ? state.endTime - state.startTime : 0;

		const wpm = calculateWPM(chars, elapsed);
		const rawWpm = calculateRawWPM(chars, elapsed);
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

		// Save typing result to Dexie
		import("@/lib/db")
			.then(({ db }) =>
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
					bookTitle:
						state.mode.type === "book" ? activeBook()?.meta.title : undefined,
				} as TypingResult),
			)
			.catch((err) => console.error("Failed to save result:", err));

		// Save book progress if in book mode
		if (state.mode.type === "book" && activeBook() && bookFeeder()) {
			const book = activeBook()!;
			const prev = currentBookProgress();

			// Compute resume position from actual typing progress, not
			// pre-fetched feeder position (which may be far ahead)
			const wordsTyped = countCompletedWords(state);
			const startCh = prev?.chapterIndex ?? 0;
			const startOff = prev?.wordOffset ?? 0;
			const resume = computeBookResumePosition(
				book.chapters,
				startCh,
				startOff,
				wordsTyped,
			);

			const completedChapters = prev?.completedChapters ?? [];
			for (let i = 0; i < resume.chapterIndex; i++) {
				if (!completedChapters.includes(i)) {
					completedChapters.push(i);
				}
			}

			const newProgress: Omit<BookProgress, "id"> = {
				bookId: book.bookId,
				chapterIndex: resume.chapterIndex,
				wordOffset: resume.wordOffset,
				completedChapters,
				totalCharsTyped: (prev?.totalCharsTyped ?? 0) + breakdown.total,
				totalTimeMs: (prev?.totalTimeMs ?? 0) + elapsed,
				averageWpm: prev
					? Math.round(
							(prev.averageWpm * prev.sessionCount + wpm) /
								(prev.sessionCount + 1),
						)
					: wpm,
				sessionCount: (prev?.sessionCount ?? 0) + 1,
				lastAccessedAt: Date.now(),
				startedAt: prev?.startedAt ?? Date.now(),
				bookMeta: book.meta,
			};

			saveBookProgress(newProgress);
			setCurrentBookProgress(newProgress as BookProgress);
		}
	}

	function handleRedo() {
		setResult(null);
		if (mode().type === "book") {
			// Continue reading from saved position
			const book = activeBook();
			const feeder = bookFeeder();
			if (book && feeder && !feeder.isComplete) {
				const nextText = feeder.getNextWords(30);
				if (nextText) {
					setText(nextText);
					return;
				}
			}
			// If book is complete or no more text, go back to browser
			setActiveBook(null);
			setBookFeeder(null);
			setText(null);
		} else if (mode().type !== "custom") {
			startWithMode(mode());
		} else {
			setText(null);
		}
	}

	const bookProgressPercent = () => {
		const book = activeBook();
		const feeder = bookFeeder();
		if (!book || !feeder) return 0;
		const totalWords = book.chapters.reduce((sum, ch) => sum + ch.wordCount, 0);
		if (totalWords === 0) return 0;
		return Math.round((feeder.totalWordOffset / totalWords) * 100);
	};

	return (
		<main class="flex flex-col items-center justify-center flex-1 px-8 py-12">
			<Show when={!result() && !text()}>
				<ModeSelector
					mode={mode()}
					onModeChange={handleModeChange}
					wordListSize={prefs.wordListSize}
					onWordListSizeChange={(size) => {
						setPrefs("wordListSize", size);
						startWithMode(mode());
					}}
				/>
			</Show>

			<Switch>
				<Match when={result()}>
					{(r) => (
						<div>
							{/* Book progress info after session */}
							<Show when={mode().type === "book" && activeBook()}>
								<div class="text-center mb-6">
									<p class="text-sm text-text-sub mb-2">
										{activeBook()!.meta.title} · Chapter{" "}
										{bookFeeder()?.currentChapter !== undefined
											? bookFeeder()!.currentChapter + 1
											: "?"}
									</p>
									<div class="w-64 mx-auto h-1.5 bg-bg-secondary rounded-full overflow-hidden">
										<div
											class="h-full bg-primary transition-all"
											style={{ width: `${bookProgressPercent()}%` }}
										/>
									</div>
									<p class="text-xs text-text-sub mt-1">
										{bookProgressPercent()}% complete
									</p>
								</div>
							</Show>
							<ResultsScreen
								wpm={r().wpm}
								rawWpm={r().rawWpm}
								accuracy={r().accuracy}
								consistency={r().consistency}
								breakdown={r().breakdown}
								elapsed={r().elapsed}
								wpmPerSecond={r().wpmPerSecond}
								onRedo={handleRedo}
								redoLabel={
									mode().type === "book"
										? bookFeeder()?.isComplete
											? "Back to Library"
											: "Continue Reading"
										: undefined
								}
							/>
						</div>
					)}
				</Match>
				<Match when={text()}>
					{(t) => (
						<div class="w-full">
							{/* Book header during typing */}
							<Show when={mode().type === "book" && activeBook()}>
								<BookHeader
									book={activeBook()!.meta}
									chapterIndex={bookFeeder()?.currentChapter ?? 0}
									chapterTitle={
										activeBook()!.chapters[bookFeeder()?.currentChapter ?? 0]
											?.title
									}
									progressPercent={bookProgressPercent()}
								/>
							</Show>
							<TypingTest
								text={t()}
								mode={mode()}
								stopOnError={prefs.stopOnError}
								onComplete={handleComplete}
								bookFeeder={bookFeeder() ?? undefined}
							/>
						</div>
					)}
				</Match>
				<Match when={mode().type === "custom" && !text()}>
					<TextInputModal onSubmit={(t) => setText(t)} />
				</Match>
				<Match when={mode().type === "book" && !text() && !activeBook()}>
					<BookBrowser
						allProgress={allBookProgress() ?? []}
						onSelectBook={handleSelectBook}
						loading={bookLoading()}
					/>
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
