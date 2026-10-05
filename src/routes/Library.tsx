import { useNavigate } from "@solidjs/router";
import { createSignal, onCleanup } from "solid-js";
import { reconcile } from "solid-js/store";
import BookBrowser from "@/components/books/BookBrowser";
import { useAllBookProgress } from "@/lib/book-progress";
import { fetchAndCacheBook } from "@/lib/book-service";
import { createBookStarter } from "@/lib/book-start";
import { usePreferences } from "@/lib/preferences-context";

export default function Library() {
	const [, setPrefs] = usePreferences();
	const navigate = useNavigate();
	const allProgress = useAllBookProgress();
	const [loading, setLoading] = createSignal(false);

	/**
	 * Caches the book, then opens it in book mode on "/", which resumes it at
	 * its committed position. Leaving the library drops a start still loading.
	 */
	const starter = createBookStarter(fetchAndCacheBook, (bookId) => {
		setPrefs("lastBookId", bookId);
		setPrefs("lastMode", reconcile({ type: "book", bookId, chapterIndex: 0 }));
		navigate("/");
	});
	onCleanup(() => starter.cancel());

	/** A failed load rejects, for the sheet to show. */
	async function startBook(bookId: string): Promise<void> {
		setLoading(true);
		try {
			await starter.start(bookId);
		} catch (err) {
			console.error("Failed to load book:", err);
			throw err;
		} finally {
			setLoading(false);
		}
	}

	return (
		<main class="flex flex-1 flex-col px-4 pt-6 pb-16 sm:px-8 sm:pt-10">
			<div class="mx-auto mb-8 w-full max-w-5xl sm:mb-10">
				<h1 class="font-display text-3xl font-semibold tracking-tight text-text sm:text-4xl">
					Library
				</h1>
				<p class="mt-2 max-w-xl font-display text-sm text-text-sub sm:text-base">
					Classic books from Standard Ebooks, free and in the public domain.
					Pick one and type it a chapter at a time; Typer keeps your place.
				</p>
			</div>
			<BookBrowser
				allProgress={allProgress() ?? []}
				onSelectBook={startBook}
				loading={loading()}
			/>
		</main>
	);
}
