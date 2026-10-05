import {
	createSignal,
	For,
	type JSX,
	onCleanup,
	onMount,
	Show,
} from "solid-js";
import { describeBookError } from "@/lib/book-errors";
import { formatAge } from "@/lib/book-format";
import { useBookPercents } from "@/lib/book-progress";
import { browseCatalog, searchBooks } from "@/lib/book-service";
import { readSavedCatalogue } from "@/lib/catalogue-cache";
import type { BookMeta, BookProgress } from "@/lib/core/types/book";
import BookCard from "./BookCard";
import BookDetail from "./BookDetail";
import { LABEL_FACE } from "./typography";

interface BookBrowserProps {
	/** All book progress records (from IndexedDB) */
	allProgress: BookProgress[];
	/** Called when user wants to start/continue a book; a rejection is shown in the sheet. */
	onSelectBook: (
		bookId: string,
		progress?: BookProgress,
	) => void | Promise<void>;
	/** Whether a book is currently loading */
	loading?: boolean;
}

const PAGE_SIZE = 48;
const SKELETON_TILES = 12;
const SEARCH_DEBOUNCE_MS = 350;

const GRID =
	"grid grid-cols-2 gap-x-4 gap-y-7 min-[480px]:grid-cols-3 sm:grid-cols-4 sm:gap-x-5 md:grid-cols-5 lg:grid-cols-6";

type LoadMode = "replace" | "append" | "background";

interface Failure {
	/** What failed: the browse page, a search, or the next page. */
	op: "browse" | "search" | "more";
	error: unknown;
	retry: () => void;
}

export default function BookBrowser(props: BookBrowserProps) {
	// The last good catalogue page shows at once; a fresh one replaces it.
	const saved = readSavedCatalogue();
	const [books, setBooks] = createSignal<BookMeta[]>(saved?.books ?? []);
	/** When the grid is the saved copy, the time it was fetched. */
	const [savedAt, setSavedAt] = createSignal<number | null>(
		saved?.savedAt ?? null,
	);
	const [searchQuery, setSearchQuery] = createSignal("");
	const [activeQuery, setActiveQuery] = createSignal("");
	const [page, setPage] = createSignal(1);
	const [fetching, setFetching] = createSignal(false);
	const [appending, setAppending] = createSignal(false);
	const [background, setBackground] = createSignal(false);
	const [failure, setFailure] = createSignal<Failure | null>(null);
	const [hasMore, setHasMore] = createSignal(
		saved ? saved.books.length >= PAGE_SIZE : true,
	);
	const [selectedBook, setSelectedBook] = createSignal<BookMeta | null>(null);
	const [startError, setStartError] = createSignal<unknown>(null);
	const bookPercents = useBookPercents();
	const compact = useMediaQuery("(max-width: 639px)");

	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	let requestId = 0;
	let searchInput: HTMLInputElement | undefined;
	let lastTrigger: HTMLElement | undefined;

	/**
	 * Fetches a catalogue page. A background load refreshes the saved copy
	 * without dimming it; a retry keeps its failure on screen until it lands.
	 */
	async function loadBooks(
		query: string,
		pageNum: number,
		mode: LoadMode = "replace",
		retrying = false,
	) {
		const id = ++requestId;
		const append = mode === "append";
		setFetching(true);
		setAppending(append);
		setBackground(mode === "background");
		if (!retrying) setFailure(null);
		try {
			const results = query
				? await searchBooks(query, pageNum)
				: await browseCatalog(pageNum);
			if (id !== requestId) return;
			setBooks((prev) => (append ? [...prev, ...results] : results));
			setActiveQuery(query);
			setHasMore(results.length >= PAGE_SIZE);
			if (!append) setSavedAt(null);
			setFailure(null);
		} catch (err) {
			if (id !== requestId) return;
			console.error("Failed to fetch books:", err);
			setFailure({
				op: append ? "more" : query ? "search" : "browse",
				error: err,
				retry: () => loadBooks(query, pageNum, mode, true),
			});
		} finally {
			if (id === requestId) {
				setFetching(false);
				setAppending(false);
				setBackground(false);
			}
		}
	}

	onMount(() => loadBooks("", 1, saved ? "background" : "replace"));

	function handleSearch(value: string) {
		setSearchQuery(value);
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			setPage(1);
			loadBooks(value.trim(), 1);
		}, SEARCH_DEBOUNCE_MS);
	}

	function clearSearch() {
		clearTimeout(debounceTimer);
		setSearchQuery("");
		setPage(1);
		loadBooks("", 1);
		searchInput?.focus();
	}

	function retry() {
		const failed = failure();
		if (failed) failed.retry();
		else loadBooks(activeQuery(), 1);
	}

	function loadMore() {
		const nextPage = page() + 1;
		setPage(nextPage);
		loadBooks(activeQuery(), nextPage, "append");
	}

	function getProgress(bookId: string): BookProgress | undefined {
		return props.allProgress.find((p) => p.bookId === bookId);
	}

	function getPercent(bookId: string): number {
		return bookPercents()[bookId] ?? 0;
	}

	function handleBookClick(book: BookMeta, trigger: HTMLElement) {
		lastTrigger = trigger;
		setStartError(null);
		setSelectedBook(book);
	}

	function closeDetail() {
		setSelectedBook(null);
		setStartError(null);
		lastTrigger?.focus({ preventScroll: true });
	}

	/** The sheet stays open until the book opens, and shows why it didn't. */
	async function handleStart() {
		const book = selectedBook();
		if (!book) return;
		setStartError(null);
		try {
			await props.onSelectBook(book.id, getProgress(book.id));
		} catch (err) {
			if (selectedBook() === book) setStartError(err);
			return;
		}
		if (selectedBook() === book) setSelectedBook(null);
	}

	onCleanup(() => clearTimeout(debounceTimer));

	const inProgressBooks = () =>
		props.allProgress
			.toSorted((a, b) => b.lastAccessedAt - a.lastAccessedAt)
			.map((p) => p.bookMeta)
			.filter(Boolean);

	const initialLoad = () => fetching() && !failure() && books().length === 0;
	const refreshing = () =>
		fetching() && !appending() && !background() && books().length > 0;
	const showEmpty = () => !fetching() && !failure() && books().length === 0;
	const retrying = () => fetching() && failure() !== null;
	const blockingFailure = () =>
		books().length === 0 ? (failure() ?? null) : null;
	const gridNote = () => {
		const f = failure();
		return f && f.op !== "more" && books().length > 0 ? f : null;
	};
	/** A short headline, and detail shown where there is room. */
	const gridNoteText = (f: Failure): [string, string] => {
		if (f.op === "search") return ["Search didn't go through", ""];
		const at = savedAt();
		return [
			"Couldn't refresh",
			at === null ? "" : ` · showing the copy from ${formatAge(at)}`,
		];
	};

	const countLabel = () => {
		if (initialLoad() || blockingFailure()) return "";
		const n = books().length;
		if (activeQuery()) {
			if (n === 0) return "No results";
			return `${n}${hasMore() ? "+" : ""} ${n === 1 ? "match" : "matches"}`;
		}
		return `Showing ${n}`;
	};

	return (
		<div class="mx-auto min-h-[75dvh] w-full max-w-5xl">
			<div class="group/search relative mb-10">
				<svg
					viewBox="0 0 24 24"
					class="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-text-sub transition-colors group-focus-within/search:text-primary"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					aria-hidden="true"
				>
					<circle cx="11" cy="11" r="7" />
					<path d="M20 20l-3.5-3.5" />
				</svg>
				<input
					ref={searchInput}
					type="search"
					aria-label="Search books"
					placeholder={compact() ? "Search books" : "Search by title or author"}
					autocomplete="off"
					spellcheck={false}
					class="h-12 w-full rounded-xl bg-bg-secondary pr-11 pl-11 text-text ring-1 ring-text/10 outline-none transition-[box-shadow,background-color] placeholder:text-text-sub/80 focus:ring-2 focus:ring-primary/60 [&::-webkit-search-cancel-button]:appearance-none"
					value={searchQuery()}
					onInput={(e) => handleSearch(e.currentTarget.value)}
					onKeyDown={(e) => {
						if (e.key === "Escape" && searchQuery()) {
							e.preventDefault();
							clearSearch();
						}
					}}
				/>
				<Show when={searchQuery()}>
					<button
						type="button"
						aria-label="Clear search"
						class="absolute top-1/2 right-2.5 grid size-8 -translate-y-1/2 place-items-center rounded-full text-text-sub outline-none transition-colors hover:bg-bg hover:text-text focus-visible:ring-2 focus-visible:ring-primary"
						onClick={clearSearch}
					>
						<svg
							viewBox="0 0 24 24"
							class="size-4"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							aria-hidden="true"
						>
							<path d="M7 7l10 10M17 7L7 17" />
						</svg>
					</button>
				</Show>
			</div>

			<Show when={!searchQuery() && inProgressBooks().length > 0}>
				<section class="mb-12">
					<SectionHeading title="Continue reading" />
					<div class="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pt-1 pb-3 sm:gap-5">
						<For each={inProgressBooks()}>
							{(book, i) => (
								<div class="shrink-0 snap-start">
									<BookCard
										book={book}
										progress={getProgress(book.id)}
										percent={getPercent(book.id)}
										onClick={handleBookClick}
										index={i()}
										class="w-[7.5rem] sm:w-36"
									/>
								</div>
							)}
						</For>
					</div>
				</section>
			</Show>

			<section aria-busy={fetching()}>
				<SectionHeading
					title={activeQuery() ? "Search results" : "All books"}
					aside={
						<Show
							when={gridNote()}
							fallback={
								<Show when={refreshing()} fallback={countLabel()}>
									Searching…
								</Show>
							}
						>
							{(f) => (
								<HeaderNotice
									text={gridNoteText(f())}
									retrying={retrying()}
									onRetry={retry}
								/>
							)}
						</Show>
					}
				/>

				<Show when={blockingFailure()}>
					{(f) => (
						<ErrorState
							error={f().error}
							retrying={retrying()}
							onRetry={retry}
						/>
					)}
				</Show>

				<Show when={showEmpty()}>
					<EmptyState
						title={
							activeQuery()
								? `No books match “${activeQuery()}”`
								: "The library is empty right now"
						}
						body={
							activeQuery()
								? "Try a title, or an author's surname."
								: "Try again in a moment."
						}
						action={
							activeQuery()
								? { label: "Clear search", onClick: clearSearch }
								: { label: "Try again", onClick: retry }
						}
					/>
				</Show>

				<Show when={books().length > 0 || initialLoad()}>
					<div
						class={`${GRID} motion-safe:transition-opacity motion-safe:duration-200 ${refreshing() ? "opacity-50" : ""}`}
					>
						<For each={books()}>
							{(book, i) => (
								<BookCard
									book={book}
									progress={getProgress(book.id)}
									percent={getPercent(book.id)}
									onClick={handleBookClick}
									index={i() % PAGE_SIZE}
								/>
							)}
						</For>
						<Show when={initialLoad() || appending()}>
							<For each={Array.from({ length: SKELETON_TILES })}>
								{() => <SkeletonCard />}
							</For>
						</Show>
					</div>
				</Show>

				<Show when={failure()?.op === "more"}>
					<InlineNotice
						text="Couldn't load more books."
						retrying={retrying()}
						onRetry={retry}
						class="mt-8"
					/>
				</Show>

				<Show
					when={hasMore() && !fetching() && !failure() && books().length > 0}
				>
					<div class="mt-10 flex justify-center">
						<button
							type="button"
							class={`${LABEL_FACE} rounded-full px-6 py-2.5 text-sm font-medium text-text-sub ring-1 ring-text/15 outline-none transition-colors hover:text-text hover:ring-primary/50 focus-visible:ring-2 focus-visible:ring-primary`}
							onClick={loadMore}
						>
							Load more books
						</button>
					</div>
				</Show>
			</section>

			<Show when={selectedBook()}>
				{(book) => (
					<BookDetail
						book={book()}
						progress={getProgress(book().id)}
						percent={getPercent(book().id)}
						loading={props.loading}
						error={startError() ? describeBookError(startError()) : null}
						onStart={handleStart}
						onClose={closeDetail}
					/>
				)}
			</Show>
		</div>
	);
}

function useMediaQuery(query: string) {
	if (typeof window === "undefined" || !window.matchMedia) return () => false;
	const mql = window.matchMedia(query);
	const [matches, setMatches] = createSignal(mql.matches);
	const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
	mql.addEventListener("change", onChange);
	onCleanup(() => mql.removeEventListener("change", onChange));
	return matches;
}

function SectionHeading(props: { title: string; aside?: JSX.Element }) {
	return (
		<div class="mb-5 flex items-center gap-4">
			<h3
				class={`${LABEL_FACE} shrink-0 text-xs font-semibold tracking-[0.2em] text-text-sub uppercase`}
			>
				{props.title}
			</h3>
			<span class="h-px flex-1 bg-text/10" />
			<Show when={props.aside}>
				<span
					class="shrink-0 text-xs text-text-sub tabular-nums"
					aria-live="polite"
				>
					{props.aside}
				</span>
			</Show>
		</div>
	);
}

function SkeletonCard() {
	return (
		<div
			class="flex flex-col gap-2.5"
			aria-hidden="true"
			data-testid="book-skeleton"
		>
			<div class="aspect-[2/3] w-full rounded-md bg-bg-secondary motion-safe:animate-pulse" />
			<div class="space-y-1.5 px-0.5">
				<div class="h-3.5 w-4/5 rounded bg-bg-secondary motion-safe:animate-pulse" />
				<div class="h-3 w-1/2 rounded bg-bg-secondary motion-safe:animate-pulse" />
			</div>
		</div>
	);
}

function EmptyState(props: {
	title: string;
	body: string;
	action: { label: string; onClick: () => void };
}) {
	return (
		<div class="flex flex-col items-center rounded-xl px-6 py-16 text-center ring-1 ring-text/10 ring-inset">
			<svg
				viewBox="0 0 24 24"
				class="mb-4 size-8 text-text-sub/70"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M4 19.5V5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2zm0 0A2 2 0 0 0 6 22h13" />
			</svg>
			<p class="text-text">{props.title}</p>
			<p class="mt-1.5 text-sm text-text-sub">{props.body}</p>
			<button
				type="button"
				class={`${LABEL_FACE} mt-6 rounded-full px-5 py-2 text-sm font-medium text-primary ring-1 ring-primary/40 outline-none transition-colors hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary`}
				onClick={props.action.onClick}
			>
				{props.action.label}
			</button>
		</div>
	);
}

function RetryIcon(props: { spinning?: boolean; small?: boolean }) {
	return (
		<svg
			viewBox="0 0 24 24"
			class={`${props.small ? "size-3" : "size-4"} ${props.spinning ? "motion-safe:animate-spin" : ""}`}
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M20 12a8 8 0 1 1-2.34-5.66" />
			<path d="M20 4v4.5h-4.5" />
		</svg>
	);
}

/** The catalogue could not load and there is nothing saved to show. */
function ErrorState(props: {
	error: unknown;
	retrying: boolean;
	onRetry: () => void;
}) {
	const copy = () => describeBookError(props.error);
	return (
		<div
			role="alert"
			class="relative flex flex-col items-center overflow-hidden rounded-xl bg-bg-secondary/40 px-6 py-16 text-center ring-1 ring-text/10 ring-inset sm:py-20"
		>
			<div class="relative mb-6 grid size-14 place-items-center">
				<span class="absolute inset-0 rounded-full bg-error/10 ring-1 ring-error/25" />
				<svg
					viewBox="0 0 24 24"
					class="relative size-6 text-error"
					fill="none"
					stroke="currentColor"
					stroke-width="1.75"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M4 19.5V5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2zm0 0A2 2 0 0 0 6 22h13" />
					<path d="M10 8.5l4 4M14 8.5l-4 4" />
				</svg>
			</div>
			<p class={`${LABEL_FACE} text-lg font-semibold text-text`}>
				{copy().title}
			</p>
			<p class="mt-2 max-w-sm text-sm text-pretty text-text-sub">
				{copy().body}
			</p>
			<button
				type="button"
				class={`${LABEL_FACE} mt-7 inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-bg outline-none transition-[filter,transform] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-text focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:scale-[0.98] disabled:opacity-70`}
				onClick={props.onRetry}
				disabled={props.retrying}
				aria-busy={props.retrying}
			>
				<RetryIcon spinning={props.retrying} />
				{props.retrying ? "Trying again" : "Try again"}
			</button>
			<p class="mt-6 text-xs text-text-sub/70">
				Books come from Standard Ebooks, a free public-domain library.
			</p>
		</div>
	);
}

/**
 * A failed refresh, said in the section header in place of the count, so
 * the grid below never moves.
 */
function HeaderNotice(props: {
	text: [string, string];
	retrying: boolean;
	onRetry: () => void;
}) {
	return (
		<span data-testid="library-stale" class="inline-flex items-center gap-2">
			<span
				class="size-1.5 shrink-0 rounded-full bg-error"
				aria-hidden="true"
			/>
			<span class="text-text-sub">
				{props.text[0]}
				<span class="hidden md:inline">{props.text[1]}</span>
			</span>
			<button
				type="button"
				class="-my-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-primary outline-none transition-colors hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-70"
				onClick={props.onRetry}
				disabled={props.retrying}
				aria-busy={props.retrying}
			>
				<RetryIcon spinning={props.retrying} small />
				{props.retrying ? "Retrying" : "Retry"}
			</button>
		</span>
	);
}

/** A quiet one-line failure below a grid that still has books. */
function InlineNotice(props: {
	text: string;
	retrying: boolean;
	onRetry: () => void;
	class?: string;
}) {
	return (
		<div
			role="status"
			class={`flex items-center gap-3 rounded-lg bg-bg-secondary/60 py-2 pr-2 pl-4 text-sm text-text-sub ring-1 ring-text/10 ring-inset ${props.class ?? ""}`}
		>
			<span
				class="size-1.5 shrink-0 rounded-full bg-error"
				aria-hidden="true"
			/>
			<span class="min-w-0 flex-1 text-pretty">{props.text}</span>
			<button
				type="button"
				class="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-primary outline-none transition-colors hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-70"
				onClick={props.onRetry}
				disabled={props.retrying}
				aria-busy={props.retrying}
			>
				<RetryIcon spinning={props.retrying} />
				{props.retrying ? "Retrying" : "Retry"}
			</button>
		</div>
	);
}
