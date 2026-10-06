import { fireEvent, render, screen, within } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { browseCatalog, searchBooks } from "@/lib/book-service";
import { saveCatalogue } from "@/lib/catalogue-cache";
import type { BookMeta, BookProgress } from "@/lib/core/types/book";
import { NetworkError } from "@/lib/core/types/errors";
import BookBrowser from "./BookBrowser";

vi.mock("@/lib/book-service", () => ({
	browseCatalog: vi.fn().mockResolvedValue([]),
	searchBooks: vi.fn().mockResolvedValue([]),
	loadBookDetail: vi.fn().mockRejectedValue(new Error("not in tests")),
	getCachedBook: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/book-progress", () => ({
	useBookPercents: () => () => ({}),
	useAverageWpm: () => () => null,
}));

beforeEach(() => {
	localStorage.clear();
	vi.mocked(browseCatalog).mockReset().mockResolvedValue([]);
	vi.spyOn(console, "error").mockImplementation(() => {});
	window.matchMedia ??= ((query: string) => ({
		matches: query.includes("reduce"),
		media: query,
		addEventListener: () => {},
		removeEventListener: () => {},
	})) as unknown as typeof window.matchMedia;
});

function progress(bookId: string, lastAccessedAt: number): BookProgress {
	const bookMeta: BookMeta = {
		id: bookId,
		title: `Title ${bookId}`,
		author: "Author",
		description: "",
		language: "en",
		wordCount: 100,
		coverUrl: "",
		coverHeroUrl: "",
		chapters: ["chapter-1"],
		datePublished: "",
		dateModified: "",
	};
	return {
		bookId,
		chapterIndex: 0,
		wordOffset: 0,
		completedChapters: [],
		totalCharsTyped: 0,
		totalTimeMs: 0,
		averageWpm: 0,
		sessionCount: 1,
		lastAccessedAt,
		startedAt: 0,
		bookMeta,
	};
}

describe("BookBrowser", () => {
	it("lists in-progress books most recent first without mutating the progress prop", () => {
		const allProgress = Object.freeze([
			progress("a/old", 1),
			progress("b/new", 2),
		]) as BookProgress[];

		render(() => (
			<BookBrowser allProgress={allProgress} onSelectBook={() => {}} />
		));

		const titles = screen.getAllByText(/^Title /).map((el) => el.textContent);
		expect([...new Set(titles)]).toEqual(["Title b/new", "Title a/old"]);
		expect(allProgress.map((p) => p.bookId)).toEqual(["a/old", "b/new"]);
	});
});

describe("BookBrowser catalogue states", () => {
	it("holds the grid with skeleton tiles until the catalogue arrives", async () => {
		let resolve: (books: BookMeta[]) => void = () => {};
		vi.mocked(browseCatalog).mockReturnValueOnce(
			new Promise((r) => {
				resolve = r;
			}),
		);

		render(() => <BookBrowser allProgress={[]} onSelectBook={() => {}} />);

		expect(screen.getAllByTestId("book-skeleton").length).toBeGreaterThan(0);
		resolve([progress("a/one", 0).bookMeta]);
		expect(await screen.findAllByText("Title a/one")).not.toHaveLength(0);
		expect(screen.queryAllByTestId("book-skeleton")).toHaveLength(0);
	});

	it("offers to clear a search that finds nothing", async () => {
		vi.mocked(searchBooks).mockResolvedValueOnce([]);
		render(() => <BookBrowser allProgress={[]} onSelectBook={() => {}} />);

		fireEvent.input(screen.getByRole("searchbox"), {
			target: { value: "zzzz" },
		});

		expect(
			await screen.findByText(/No books match/, {}, { timeout: 2000 }),
		).toBeTruthy();
		expect(
			screen.getAllByRole("button", { name: "Clear search" }),
		).not.toHaveLength(0);
	});
});

describe("BookBrowser resilience", () => {
	const saved = progress("s/saved", 0).bookMeta;
	const fresh = progress("f/fresh", 0).bookMeta;

	it("shows the saved catalogue at once, then swaps in the fresh page", async () => {
		saveCatalogue([saved], Date.now());
		let resolve: (books: BookMeta[]) => void = () => {};
		vi.mocked(browseCatalog).mockReturnValueOnce(
			new Promise((r) => {
				resolve = r;
			}),
		);

		render(() => <BookBrowser allProgress={[]} onSelectBook={() => {}} />);

		expect(screen.getAllByText("Title s/saved")).not.toHaveLength(0);
		expect(screen.queryAllByTestId("book-skeleton")).toHaveLength(0);
		resolve([fresh]);
		expect(await screen.findAllByText("Title f/fresh")).not.toHaveLength(0);
		expect(screen.queryAllByText("Title s/saved")).toHaveLength(0);
	});

	it("keeps the saved grid with a quiet note when the refresh fails", async () => {
		saveCatalogue([saved], Date.now());
		vi.mocked(browseCatalog)
			.mockRejectedValueOnce(new NetworkError("down"))
			.mockResolvedValueOnce([fresh]);

		render(() => <BookBrowser allProgress={[]} onSelectBook={() => {}} />);

		const note = await screen.findByTestId("library-stale");
		expect(note).toHaveTextContent(/couldn't refresh/i);
		expect(screen.getAllByText("Title s/saved")).not.toHaveLength(0);

		fireEvent.click(within(note).getByRole("button", { name: /retry/i }));
		expect(await screen.findAllByText("Title f/fresh")).not.toHaveLength(0);
		expect(screen.queryByTestId("library-stale")).toBeNull();
	});

	it("shows an error with Retry when nothing is saved and the fetch fails", async () => {
		vi.mocked(browseCatalog)
			.mockRejectedValueOnce(new NetworkError("down"))
			.mockResolvedValueOnce([fresh]);

		render(() => <BookBrowser allProgress={[]} onSelectBook={() => {}} />);

		const error = await screen.findByRole("alert");
		expect(error).toHaveTextContent(/couldn't reach standard ebooks/i);
		expect(screen.queryAllByTestId("book-skeleton")).toHaveLength(0);

		fireEvent.click(within(error).getByRole("button", { name: /try again/i }));
		expect(await screen.findAllByText("Title f/fresh")).not.toHaveLength(0);
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("keeps the book sheet open with an inline error when Start fails", async () => {
		vi.mocked(browseCatalog).mockResolvedValueOnce([fresh]);
		const onSelectBook = vi
			.fn()
			.mockRejectedValueOnce(new NetworkError("down", { timedOut: true }))
			.mockResolvedValueOnce(undefined);

		render(() => <BookBrowser allProgress={[]} onSelectBook={onSelectBook} />);
		fireEvent.click(
			(await screen.findAllByRole("button", { name: /Title f\/fresh/ }))[0],
		);
		fireEvent.click(screen.getByRole("button", { name: /start reading/i }));

		const dialog = screen.getByRole("dialog");
		const error = await within(dialog).findByRole("alert");
		expect(error).toHaveTextContent(/taking too long/i);

		fireEvent.click(within(dialog).getByRole("button", { name: /try again/i }));
		expect(onSelectBook).toHaveBeenCalledTimes(2);
		await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	});
});
