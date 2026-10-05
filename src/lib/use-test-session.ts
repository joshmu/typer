import { type Accessor, createMemo, createSignal } from "solid-js";
import { useAllBookProgress } from "@/lib/book-progress";
import { fetchAndCacheBook as defaultFetchAndCacheBook } from "@/lib/book-service";
import {
	type BookReader,
	countCompletedWords,
} from "@/lib/core/engine/book-reader";
import { completeTest } from "@/lib/core/engine/complete-test";
import { deriveResultInsights } from "@/lib/core/engine/result-insights";
import {
	applyBookSelection,
	applyResult,
	applyText,
	createInitialSession,
	decideRedo,
	type SessionResult,
	type SessionState,
} from "@/lib/core/engine/session-manager";
import { getRandomQuote } from "@/lib/core/text/quotes";
import { loadWordList as defaultLoadWordList } from "@/lib/core/text/word-list-loader";
import { createWordFeed, generateWords } from "@/lib/core/text/words";
import type { Feed, TestMode, TypingState } from "@/lib/core/types";
import type { BookProgress, CachedBook } from "@/lib/core/types/book";
import { isAppError } from "@/lib/core/types/errors";
import {
	recordCompletion as defaultRecordCompletion,
	toTypingResult,
} from "@/lib/history";
import { DEFAULT_MODE } from "@/lib/last-mode";
import type { UserPreferences } from "@/lib/preferences";
import { exitTypingBlock as defaultExitTyping } from "@/lib/typing-exit";
import { isTypingActive } from "@/lib/typing-focus";

/** Words fed per typing window in book/zen mode. */
export const BOOK_WORD_COUNT = 30;
/** Words in the first window of a time test; it refills as you type. */
const TIME_MODE_WORD_COUNT = 200;

export interface UseTestSessionOptions {
	wordListSize: () => UserPreferences["wordListSize"];
	/** The mode before the first start; a time 30 test by default. */
	initialMode?: TestMode;
	/** Test-only IO overrides. */
	deps?: Partial<{
		fetchAndCacheBook: typeof defaultFetchAndCacheBook;
		loadWordList: typeof defaultLoadWordList;
		recordCompletion: typeof defaultRecordCompletion;
		exitTyping: typeof defaultExitTyping;
	}>;
}

export interface TestSession {
	mode: Accessor<TestMode>;
	text: Accessor<string | null>;
	result: Accessor<SessionResult | null>;
	/** The shown result could not be recorded. */
	saveFailed: Accessor<boolean>;
	activeBook: Accessor<CachedBook | null>;
	bookReader: Accessor<BookReader | null>;
	feed: Accessor<Feed | null>;
	bookLoading: Accessor<boolean>;
	bookProgressPercent: Accessor<number>;
	allBookProgress: Accessor<BookProgress[]>;
	startWithMode: (mode: TestMode) => Promise<void>;
	setCustomText: (text: string) => void;
	selectBook: (bookId: string, prev?: BookProgress) => Promise<void>;
	/** Opens an already cached book at its committed position. */
	openBook: (book: CachedBook, progress?: BookProgress) => void;
	complete: (state: TypingState) => void;
	redo: () => void;
}

export function useTestSession(options: UseTestSessionOptions): TestSession {
	const fetchBook = options.deps?.fetchAndCacheBook ?? defaultFetchAndCacheBook;
	const record = options.deps?.recordCompletion ?? defaultRecordCompletion;
	const loadWordList = options.deps?.loadWordList ?? defaultLoadWordList;
	const exitTyping = options.deps?.exitTyping ?? defaultExitTyping;

	const [session, setSession] = createSignal<SessionState>(
		createInitialSession(options.initialMode ?? DEFAULT_MODE),
	);
	// One memo per field, so a change to one field leaves readers of the others alone.
	const field = <K extends keyof SessionState>(key: K) =>
		createMemo(() => session()[key]);
	const mode = field("mode");
	const text = field("text");
	const result = field("result");
	const activeBook = field("activeBook");
	const bookReader = field("bookReader");
	const feed = field("feed");
	const [bookLoading, setBookLoading] = createSignal(false);
	const [saveFailed, setSaveFailed] = createSignal(false);

	const allBookProgress = useAllBookProgress();

	const bookProgressPercent = createMemo(() => bookReader()?.percent ?? 0);

	// Bumped by anything that replaces the current test, so pending loads go stale.
	let latestStart = 0;
	const isStale = (request: number) =>
		request !== latestStart || isTypingActive();

	async function startWithMode(newMode: TestMode): Promise<void> {
		const request = ++latestStart;
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
		if (isStale(request)) return;
		setSession(next);
	}

	function setCustomText(value: string): void {
		latestStart++;
		setSession((s) => applyText(s, value));
	}

	let latestBookFetch = 0;

	async function selectBook(
		bookId: string,
		prevProgress?: BookProgress,
	): Promise<void> {
		const request = ++latestStart;
		latestBookFetch = request;
		setBookLoading(true);
		try {
			const cached = await fetchBook(bookId);
			if (isStale(request)) return;
			setSession((s) =>
				applyBookSelection(s, cached, prevProgress ?? null, BOOK_WORD_COUNT),
			);
		} catch (err) {
			if (isAppError(err)) {
				console.error(`[${err.kind}] ${err.message}`, err);
			} else {
				console.error("Failed to load book:", err);
			}
		} finally {
			if (request === latestBookFetch) setBookLoading(false);
		}
	}

	function openBook(book: CachedBook, progress?: BookProgress): void {
		latestStart++;
		setSession((s) =>
			applyBookSelection(s, book, progress ?? null, BOOK_WORD_COUNT),
		);
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

		const request = ++latestStart;
		let failed = false;
		setSaveFailed(false);
		const insights = deriveResultInsights(state, testResult.elapsed, now);
		const show = () => {
			if (request !== latestStart) return;
			setSession((s) => applyResult(s, testResult, draft, insights));
			if (failed) setSaveFailed(true);
		};
		const exiting = exitTyping();
		if (exiting) void exiting.then(show);
		else show();

		void record(
			toTypingResult(state, completed, activeBook()?.meta.title, now),
			draft,
		).catch((err: unknown) => {
			console.error("Failed to record the completed test:", err);
			failed = true;
			if (result()?.insights === insights) setSaveFailed(true);
		});
	}

	function redo(): void {
		const outcome = decideRedo(session(), BOOK_WORD_COUNT);
		setSession(outcome.state);
		if (outcome.kind === "restart-mode") {
			void startWithMode(outcome.mode);
		}
	}

	return {
		mode,
		text,
		result,
		saveFailed,
		activeBook,
		bookReader,
		feed,
		bookLoading,
		bookProgressPercent,
		allBookProgress,
		startWithMode,
		setCustomText,
		selectBook,
		openBook,
		complete,
		redo,
	};
}
