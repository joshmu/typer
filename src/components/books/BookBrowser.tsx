import {
	createSignal,
	For,
	type JSX,
	onCleanup,
	onMount,
	Show,
} from "solid-js";
import { useBookPercents } from "@/lib/book-progress";
import { browseCatalog, searchBooks } from "@/lib/book-service";
import type { BookMeta, BookProgress } from "@/lib/core/types/book";
import BookCard from "./BookCard";
import BookDetail from "./BookDetail";
import { LABEL_FACE } from "./typography";

interface BookBrowserProps {
	/** All book progress records (from IndexedDB) */
	allProgress: BookProgress[];
	/** Called when user wants to start/continue a book */
	onSelectBook: (bookId: string, progress?: BookProgress) => void;
	/** Whether a book is currently loading */
	loading?: boolean;
}

const PAGE_SIZE = 48;
const SKELETON_TILES = 12;
const SEARCH_DEBOUNCE_MS = 350;

const GRID =
	"grid grid-cols-2 gap-x-4 gap-y-7 min-[480px]:grid-cols-3 sm:grid-cols-4 sm:gap-x-5 md:grid-cols-5 lg:grid-cols-6";

export default function BookBrowser(props: BookBrowserProps) {
	const [books, setBooks] = createSignal<BookMeta[]>([]);
	const [searchQuery, setSearchQuery] = createSignal("");
	const [activeQuery, setActiveQuery] = createSignal("");
	const [page, setPage] = createSignal(1);
	const [fetching, setFetching] = createSignal(false);
	const [appending, setAppending] = createSignal(false);
	const [failed, setFailed] = createSignal(false);
	const [hasMore, setHasMore] = createSignal(true);
	const [selectedBook, setSelectedBook] = createSignal<BookMeta | null>(null);
	const bookPercents = useBookPercents();

	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	let requestId = 0;
	let searchInput: HTMLInputElement | undefined;
	let lastTrigger: HTMLElement | undefined;

	async function loadBooks(query: string, pageNum: number, append = false) {
		const id = ++requestId;
		setFetching(true);
		setAppending(append);
		setFailed(false);
		try {
			const results = query
				? await searchBooks(query, pageNum)
				: await browseCatalog(pageNum);
			if (id !== requestId) return;
			setBooks((prev) => (append ? [...prev, ...results] : results));
			setActiveQuery(query);
			setHasMore(results.length >= PAGE_SIZE);
		} catch (err) {
			if (id !== requestId) return;
			console.error("Failed to fetch books:", err);
			setFailed(true);
		} finally {
			if (id === requestId) {
				setFetching(false);
				setAppending(false);
			}
		}
	}

	onMount(() => loadBooks("", 1));

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
		loadBooks(activeQuery() || searchQuery().trim(), page(), page() > 1);
	}

	function loadMore() {
		const nextPage = page() + 1;
		setPage(nextPage);
		loadBooks(activeQuery(), nextPage, true);
	}

	function getProgress(bookId: string): BookProgress | undefined {
		return props.allProgress.find((p) => p.bookId === bookId);
	}

	function getPercent(bookId: string): number {
		return bookPercents()[bookId] ?? 0;
	}

	function handleBookClick(book: BookMeta, trigger: HTMLElement) {
		lastTrigger = trigger;
		setSelectedBook(book);
	}

	function closeDetail() {
		setSelectedBook(null);
		lastTrigger?.focus({ preventScroll: true });
	}

	function handleStart() {
		const book = selectedBook();
		if (!book) return;
		const progress = getProgress(book.id);
		props.onSelectBook(book.id, progress);
		setSelectedBook(null);
	}

	onCleanup(() => clearTimeout(debounceTimer));

	const inProgressBooks = () =>
		props.allProgress
			.toSorted((a, b) => b.lastAccessedAt - a.lastAccessedAt)
			.map((p) => p.bookMeta)
			.filter(Boolean);

	const initialLoad = () => fetching() && books().length === 0;
	const refreshing = () => fetching() && !appending() && books().length > 0;
	const showEmpty = () => !fetching() && !failed() && books().length === 0;

	const countLabel = () => {
		if (initialLoad()) return "";
		const n = books().length;
		const shown = `${n}${hasMore() ? "+" : ""}`;
		if (activeQuery()) return `${shown} ${n === 1 ? "result" : "results"}`;
		return `${shown} books`;
	};

	return (
		<div class="mx-auto w-full max-w-5xl">
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
					placeholder="Search by title or author"
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
						<Show when={refreshing()} fallback={countLabel()}>
							Searching…
						</Show>
					}
				/>

				<Show when={failed() && books().length === 0}>
					<EmptyState
						title="Couldn't reach the library"
						body="Standard Ebooks didn't answer. Check your connection and try again."
						action={{ label: "Try again", onClick: retry }}
					/>
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

				<Show when={failed() && books().length > 0}>
					<p class="mt-8 text-center text-sm text-text-sub">
						Couldn't load more books.{" "}
						<button
							type="button"
							class="text-primary underline-offset-4 hover:underline"
							onClick={retry}
						>
							Try again
						</button>
					</p>
				</Show>

				<Show
					when={hasMore() && !fetching() && !failed() && books().length > 0}
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
						onStart={handleStart}
						onClose={closeDetail}
					/>
				)}
			</Show>
		</div>
	);
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
