import { type Accessor, batch, createMemo, createSignal } from "solid-js";
import { useAllBookProgress } from "@/lib/book-progress";
import { fetchAndCacheBook as defaultFetchAndCacheBook } from "@/lib/book-service";
import {
	type BookReader,
	countCompletedWords,
} from "@/lib/core/engine/book-reader";
import { completeTest, type TestResult } from "@/lib/core/engine/complete-test";
import {
	applyBookSelection,
	applyResult,
	applyText,
	createInitialSession,
	decideRedo,
	type SessionState,
} from "@/lib/core/engine/session-manager";
import { getRandomQuote } from "@/lib/core/text/quotes";
import { loadWordList } from "@/lib/core/text/word-list-loader";
import { createWordFeed, generateWords } from "@/lib/core/text/words";
import type { Feed, TestMode, TypingState } from "@/lib/core/types";
import type { BookProgress, CachedBook } from "@/lib/core/types/book";
import { isAppError } from "@/lib/core/types/errors";
import {
	recordCompletion as defaultRecordCompletion,
	toTypingResult,
} from "@/lib/history";
import type { UserPreferences } from "@/lib/preferences";

/** Words fed per typing window in book/zen mode. */
export const BOOK_WORD_COUNT = 30;
/** Words in the first window of a time test; it refills as you type. */
const TIME_MODE_WORD_COUNT = 200;

export interface UseTestSessionOptions {
	wordListSize: () => UserPreferences["wordListSize"];
	/** Test-only IO overrides. */
	deps?: Partial<{
		fetchAndCacheBook: typeof defaultFetchAndCacheBook;
		recordCompletion: typeof defaultRecordCompletion;
	}>;
}

export interface TestSession {
	mode: Accessor<TestMode>;
	text: Accessor<string | null>;
	result: Accessor<TestResult | null>;
	activeBook: Accessor<CachedBook | null>;
	bookReader: Accessor<BookReader | null>;
	feed: Accessor<Feed | null>;
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
	const record = options.deps?.recordCompletion ?? defaultRecordCompletion;

	const initial = createInitialSession(INITIAL_MODE);
	const [mode, setMode] = createSignal<TestMode>(initial.mode);
	const [text, setText] = createSignal<string | null>(initial.text);
	const [result, setResult] = createSignal<TestResult | null>(initial.result);
	const [activeBook, setActiveBook] = createSignal<CachedBook | null>(
		initial.activeBook,
	);
	const [bookReader, setBookReader] = createSignal<BookReader | null>(
		initial.bookReader,
	);
	const [feed, setFeed] = createSignal<Feed | null>(initial.feed);
	const [currentBookProgress, setCurrentBookProgress] =
		createSignal<BookProgress | null>(initial.currentBookProgress);
	const [bookLoading, setBookLoading] = createSignal(initial.bookLoading);

	const allBookProgress = useAllBookProgress();

	const bookProgressPercent = createMemo(() => bookReader()?.percent ?? 0);

	function snapshot(): SessionState {
		return {
			mode: mode(),
			text: text(),
			result: result(),
			activeBook: activeBook(),
			bookReader: bookReader(),
			feed: feed(),
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
			setBookReader(() => next.bookReader);
			setFeed(() => next.feed);
			setCurrentBookProgress(() => next.currentBookProgress);
			setBookLoading(next.bookLoading);
		});
	}

	async function startWithMode(newMode: TestMode): Promise<void> {
		let next = createInitialSession(newMode);
		switch (newMode.type) {
			case "time":
			case "zen": {
				const wordList = await loadWordList(options.wordListSize());
				const feed = createWordFeed(wordList);
				const count =
					newMode.type === "time" ? TIME_MODE_WORD_COUNT : BOOK_WORD_COUNT;
				next = { ...applyText(next, feed.next(count)), feed };
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
		const completed = completeTest(state);
		const { result: testResult, charCount } = completed;
		const now = Date.now();

		let draft: Omit<BookProgress, "id"> | undefined;
		const reader = bookReader();
		if (state.mode.type === "book" && reader) {
			draft = reader.commit(countCompletedWords(state), {
				charCount,
				elapsedMs: testResult.elapsed,
				wpm: testResult.wpm,
				now,
			});
		}

		apply(applyResult(snapshot(), testResult, draft as BookProgress));

		void record(
			toTypingResult(state, completed, activeBook()?.meta.title, now),
			draft,
		).catch((err: unknown) =>
			console.error("Failed to record the completed test:", err),
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
		bookReader,
		feed,
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
