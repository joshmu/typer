import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { browseCatalog, searchBooks } from "@/lib/book-service";
import type { BookMeta, BookProgress } from "@/lib/core/types/book";
import BookBrowser from "./BookBrowser";

vi.mock("@/lib/book-service", () => ({
	browseCatalog: vi.fn().mockResolvedValue([]),
	searchBooks: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/book-progress", () => ({
	useBookPercents: () => () => ({}),
}));

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
