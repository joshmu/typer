import { type Accessor, batch, createMemo, createSignal } from "solid-js";
import {
	saveBookProgress as defaultSaveBookProgress,
	useAllBookProgress,
} from "@/lib/book-progress";
import { fetchAndCacheBook as defaultFetchAndCacheBook } from "@/lib/book-service";
import type { BookFeeder } from "@/lib/core/engine/book-feeder";
import {
	completeTest,
	computeNextBookProgress,
	type TestResult,
} from "@/lib/core/engine/complete-test";
import {
	applyBookSelection,
	applyResult,
	applyText,
	createInitialSession,
	decideRedo,
	type SessionState,
} from "@/lib/core/engine/session-manager";
import { simpleHash } from "@/lib/core/text/hash";
import { getRandomQuote } from "@/lib/core/text/quotes";
import { loadWordList } from "@/lib/core/text/word-list-loader";
import { generateWords } from "@/lib/core/text/words";
import type { TestMode, TypingState } from "@/lib/core/types";
import type { BookProgress, CachedBook } from "@/lib/core/types/book";
import { isAppError } from "@/lib/core/types/errors";
import { db, type TypingResult } from "@/lib/db";
import type { UserPreferences } from "@/lib/preferences";

/** Words fed per typing window in book/zen mode. */
export const BOOK_WORD_COUNT = 30;
/** Words fed per typing window for time / non-book modes. */
const TIME_MODE_WORD_COUNT = 200;

export interface UseTestSessionOptions {
	wordListSize: () => UserPreferences["wordListSize"];
	/** Test-only IO overrides. */
	deps?: Partial<{
		fetchAndCacheBook: typeof defaultFetchAndCacheBook;
		saveBookProgress: typeof defaultSaveBookProgress;
		saveTypingResult: (r: TypingResult) => Promise<unknown>;
	}>;
}

export interface TestSession {
	mode: Accessor<TestMode>;
	text: Accessor<string | null>;
	result: Accessor<TestResult | null>;
	activeBook: Accessor<CachedBook | null>;
	bookFeeder: Accessor<BookFeeder | null>;
	currentBookProgress: Accessor<BookProgress | null>;
	bookLoading: Accessor<boolean>;
	bookProgressPercent: Accessor<number>;
	allBookProgress: Accessor<BookProgress[]>;
	startWithMode: (mode: TestMode) => Promise<void>;
	setCustomText: (text: string) => void;
	selectBook: (bookId: string, prev?: BookProgress) => Promise<void>;
	complete: (state: TypingState) => void;
	redo: () => void;
}

const INITIAL_MODE: TestMode = { type: "book", bookId: "", chapterIndex: 0 };

export function useTestSession(options: UseTestSessionOptions): TestSession {
	const fetchBook = options.deps?.fetchAndCacheBook ?? defaultFetchAndCacheBook;
	const saveProgress =
		options.deps?.saveBookProgress ?? defaultSaveBookProgress;
	const saveResult =
		options.deps?.saveTypingResult ??
		((r: TypingResult) => db.results.add(r as TypingResult));

	const initial = createInitialSession(INITIAL_MODE);
	const [mode, setMode] = createSignal<TestMode>(initial.mode);
	const [text, setText] = createSignal<string | null>(initial.text);
	const [result, setResult] = createSignal<TestResult | null>(initial.result);
	const [activeBook, setActiveBook] = createSignal<CachedBook | null>(
		initial.activeBook,
	);
	const [bookFeeder, setBookFeeder] = createSignal<BookFeeder | null>(
		initial.bookFeeder,
	);
	const [currentBookProgress, setCurrentBookProgress] =
		createSignal<BookProgress | null>(initial.currentBookProgress);
	const [bookLoading, setBookLoading] = createSignal(initial.bookLoading);

	const allBookProgress = useAllBookProgress();

	const bookProgressPercent = createMemo(() => {
		const book = activeBook();
		const feeder = bookFeeder();
		if (!book || !feeder) return 0;
		const totalWords = book.chapters.reduce((sum, c) => sum + c.wordCount, 0);
		if (totalWords === 0) return 0;
		return Math.round((feeder.totalWordOffset / totalWords) * 100);
	});

	function snapshot(): SessionState {
		return {
			mode: mode(),
			text: text(),
			result: result(),
			activeBook: activeBook(),
			bookFeeder: bookFeeder(),
			currentBookProgress: currentBookProgress(),
			bookLoading: bookLoading(),
		};
	}

	function apply(next: SessionState) {
		batch(() => {
			setMode(() => next.mode);
			setText(next.text);
			setResult(() => next.result);
			setActiveBook(() => next.activeBook);
			setBookFeeder(() => next.bookFeeder);
			setCurrentBookProgress(() => next.currentBookProgress);
			setBookLoading(next.bookLoading);
		});
	}

	async function startWithMode(newMode: TestMode): Promise<void> {
		let next = createInitialSession(newMode);
		switch (newMode.type) {
			case "time": {
				const wordList = await loadWordList(options.wordListSize());
				next = applyText(
					next,
					generateWords(TIME_MODE_WORD_COUNT, { wordList }),
				);
				break;
			}
			case "words": {
				const wordList = await loadWordList(options.wordListSize());
				next = applyText(next, generateWords(newMode.count, { wordList }));
				break;
			}
			case "quote": {
				next = applyText(next, getRandomQuote(newMode.length).text);
				break;
			}
			case "zen":
				next = applyText(next, generateWords(BOOK_WORD_COUNT));
				break;
			case "custom":
			case "book":
				// Text remains null; UI shows modal/browser respectively.
				break;
		}
		apply(next);
	}

	function setCustomText(value: string): void {
		apply(applyText(snapshot(), value));
	}

	async function selectBook(
		bookId: string,
		prevProgress?: BookProgress,
	): Promise<void> {
		setBookLoading(true);
		try {
			const cached = await fetchBook(bookId);
			apply(
				applyBookSelection(
					snapshot(),
					cached,
					prevProgress ?? null,
					BOOK_WORD_COUNT,
				),
			);
		} catch (err) {
			if (isAppError(err)) {
				console.error(`[${err.kind}] ${err.message}`, err);
			} else {
				console.error("Failed to load book:", err);
			}
		} finally {
			setBookLoading(false);
		}
	}

	function complete(state: TypingState): void {
		const { result: testResult, charCount, errorCount } = completeTest(state);

		let nextProgress: BookProgress | null | undefined;
		const book = activeBook();
		if (state.mode.type === "book" && book) {
			const draft = computeNextBookProgress({
				book,
				state,
				prev: currentBookProgress(),
				result: testResult,
				charCount,
				now: Date.now(),
			});
			nextProgress = draft as BookProgress;
			void saveProgress(draft).catch((err: unknown) =>
				console.error("Failed to save book progress:", err),
			);
		}

		apply(applyResult(snapshot(), testResult, nextProgress));

		void saveResult({
			mode: state.mode.type,
			wpm: testResult.wpm,
			rawWpm: testResult.rawWpm,
			accuracy: testResult.accuracy,
			consistency: testResult.consistency,
			duration: Math.floor(testResult.elapsed / 1000),
			charCount,
			errorCount,
			timestamp: Date.now(),
			textHash: simpleHash(state.text),
			bookTitle: state.mode.type === "book" ? book?.meta.title : undefined,
		}).catch((err: unknown) =>
			console.error("Failed to save typing result:", err),
		);
	}

	function redo(): void {
		const outcome = decideRedo(snapshot(), BOOK_WORD_COUNT);
		apply(outcome.state);
		if (outcome.kind === "restart-mode") {
			void startWithMode(outcome.mode);
		}
	}

	return {
		mode,
		text,
		result,
		activeBook,
		bookFeeder,
		currentBookProgress,
		bookLoading,
		bookProgressPercent,
		allBookProgress,
		startWithMode,
		setCustomText,
		selectBook,
		complete,
		redo,
	};
}
