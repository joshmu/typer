import {
	For,
	Show,
	createEffect,
	createSignal,
	onCleanup,
} from "solid-js";
import type { BookMeta, BookProgress } from "@/lib/core/types/book";
import { browseCatalog, searchBooks } from "@/lib/book-service";
import BookCard from "./BookCard";
import BookDetail from "./BookDetail";

interface BookBrowserProps {
	/** All book progress records (from IndexedDB) */
	allProgress: BookProgress[];
	/** Called when user wants to start/continue a book */
	onSelectBook: (bookId: string, progress?: BookProgress) => void;
	/** Whether a book is currently loading */
	loading?: boolean;
}

export default function BookBrowser(props: BookBrowserProps) {
	const [books, setBooks] = createSignal<BookMeta[]>([]);
	const [searchQuery, setSearchQuery] = createSignal("");
	const [page, setPage] = createSignal(1);
	const [fetching, setFetching] = createSignal(false);
	const [hasMore, setHasMore] = createSignal(true);
	const [selectedBook, setSelectedBook] = createSignal<BookMeta | null>(null);

	let debounceTimer: ReturnType<typeof setTimeout> | undefined;

	async function loadBooks(query: string, pageNum: number, append = false) {
		setFetching(true);
		try {
			const results = query
				? await searchBooks(query, pageNum)
				: await browseCatalog(pageNum);
			if (append) {
				setBooks((prev) => [...prev, ...results]);
			} else {
				setBooks(results);
			}
			setHasMore(results.length >= 48);
		} catch (err) {
			console.error("Failed to fetch books:", err);
		} finally {
			setFetching(false);
		}
	}

	// Initial load
	createEffect(() => {
		loadBooks("", 1);
	});

	function handleSearch(value: string) {
		setSearchQuery(value);
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			setPage(1);
			loadBooks(value, 1);
		}, 400);
	}

	function loadMore() {
		const nextPage = page() + 1;
		setPage(nextPage);
		loadBooks(searchQuery(), nextPage, true);
	}

	function getProgress(bookId: string): BookProgress | undefined {
		return props.allProgress.find((p) => p.bookId === bookId);
	}

	function handleBookClick(book: BookMeta) {
		setSelectedBook(book);
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
			.sort((a, b) => b.lastAccessedAt - a.lastAccessedAt)
			.map((p) => p.bookMeta)
			.filter(Boolean);

	return (
		<div class="w-full max-w-5xl mx-auto">
			{/* Search */}
			<div class="mb-6">
				<input
					type="text"
					placeholder="Search books..."
					class="w-full px-4 py-2.5 bg-bg-secondary rounded-lg text-text placeholder:text-text-sub outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
					value={searchQuery()}
					onInput={(e) => handleSearch(e.currentTarget.value)}
				/>
			</div>

			{/* Continue Reading section */}
			<Show when={!searchQuery() && inProgressBooks().length > 0}>
				<div class="mb-8">
					<h3 class="text-xs font-medium text-text-sub uppercase tracking-wider mb-3">
						Continue Reading
					</h3>
					<div class="flex gap-3 overflow-x-auto pb-2">
						<For each={inProgressBooks()}>
							{(book) => (
								<BookCard
									book={book}
									progress={getProgress(book.id)}
									onClick={handleBookClick}
								/>
							)}
						</For>
					</div>
				</div>
			</Show>

			{/* All Books */}
			<div>
				<h3 class="text-xs font-medium text-text-sub uppercase tracking-wider mb-3">
					{searchQuery() ? "Search Results" : "All Books"}
				</h3>

				<Show
					when={books().length > 0}
					fallback={
						<Show when={!fetching()}>
							<p class="text-text-sub text-sm text-center py-8">
								{searchQuery()
									? "No books found. Try a different search."
									: "Loading books..."}
							</p>
						</Show>
					}
				>
					<div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
						<For each={books()}>
							{(book) => (
								<BookCard
									book={book}
									progress={getProgress(book.id)}
									onClick={handleBookClick}
								/>
							)}
						</For>
					</div>
				</Show>

				{/* Loading indicator */}
				<Show when={fetching()}>
					<div class="flex justify-center py-6">
						<div class="text-text-sub text-sm">Loading...</div>
					</div>
				</Show>

				{/* Load more */}
				<Show when={hasMore() && !fetching() && books().length > 0}>
					<div class="flex justify-center mt-6">
						<button
							type="button"
							class="px-6 py-2 text-sm text-text-sub hover:text-text bg-bg-secondary rounded-lg transition-colors"
							onClick={loadMore}
						>
							Load More
						</button>
					</div>
				</Show>
			</div>

			{/* Book Detail Modal */}
			<Show when={selectedBook()}>
				{(book) => (
					<BookDetail
						book={book()}
						progress={getProgress(book().id)}
						loading={props.loading}
						onStart={handleStart}
						onClose={() => setSelectedBook(null)}
					/>
				)}
			</Show>
		</div>
	);
}
