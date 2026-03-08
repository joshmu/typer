import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	parseBookDetail,
	parseCatalogPage,
	parseChapterList,
} from "./se-catalog-parser";

const fixturesDir = join(__dirname, "__fixtures__");

function loadFixture(name: string): string {
	return readFileSync(join(fixturesDir, name), "utf-8");
}

describe("parseCatalogPage", () => {
	it("extracts book metadata from catalog search results", () => {
		const xhtml = loadFixture("catalog-search.xhtml");
		const books = parseCatalogPage(xhtml);

		expect(books.length).toBeGreaterThan(0);
		expect(books.length).toBeLessThanOrEqual(48);
	});

	it("extracts title and author from book entries", () => {
		const xhtml = loadFixture("catalog-search.xhtml");
		const books = parseCatalogPage(xhtml);

		const firstBook = books[0];
		expect(firstBook.title).toBeTruthy();
		expect(firstBook.author).toBeTruthy();
	});

	it("extracts book ID from the about attribute", () => {
		const xhtml = loadFixture("catalog-search.xhtml");
		const books = parseCatalogPage(xhtml);

		// Should be path like "charles-dickens/our-mutual-friend"
		const firstBook = books[0];
		expect(firstBook.id).toContain("/");
		expect(firstBook.id.startsWith("/ebooks/")).toBe(false);
	});

	it("extracts cover image URL", () => {
		const xhtml = loadFixture("catalog-search.xhtml");
		const books = parseCatalogPage(xhtml);

		const firstBook = books[0];
		expect(firstBook.coverUrl).toContain("/images/covers/");
		expect(firstBook.coverUrl).toContain(".jpg");
	});

	it("returns empty array for non-catalog content", () => {
		const books = parseCatalogPage("<html><body>Nothing here</body></html>");
		expect(books).toEqual([]);
	});

	it("parses the dickens search results correctly", () => {
		const xhtml = loadFixture("catalog-search.xhtml");
		const books = parseCatalogPage(xhtml);

		// Search was for "dickens", should find Dickens books
		const dickensBooks = books.filter(
			(b) => b.author === "Charles Dickens",
		);
		expect(dickensBooks.length).toBeGreaterThan(0);
	});
});

describe("parseChapterList", () => {
	it("extracts chapter filenames from book TOC", () => {
		const xhtml = loadFixture("book-toc.xhtml");
		const chapters = parseChapterList(xhtml);

		expect(chapters).toContain("chapter-1");
		expect(chapters).toContain("chapter-9");
		expect(chapters.length).toBe(9);
	});

	it("excludes non-chapter entries like titlepage and colophon", () => {
		const xhtml = loadFixture("book-toc.xhtml");
		const chapters = parseChapterList(xhtml);

		expect(chapters).not.toContain("titlepage");
		expect(chapters).not.toContain("colophon");
		expect(chapters).not.toContain("imprint");
		expect(chapters).not.toContain("uncopyright");
		expect(chapters).not.toContain("dedication");
		expect(chapters).not.toContain("epigraph");
		expect(chapters).not.toContain("halftitlepage");
	});

	it("returns empty array when no chapters found", () => {
		const chapters = parseChapterList("<html><body></body></html>");
		expect(chapters).toEqual([]);
	});
});

describe("parseBookDetail", () => {
	it("extracts title from the book detail page", () => {
		const xhtml = loadFixture("book-detail.xhtml");
		const meta = parseBookDetail(xhtml, "f-scott-fitzgerald/the-great-gatsby");

		expect(meta.title).toBe("The Great Gatsby");
	});

	it("extracts author name", () => {
		const xhtml = loadFixture("book-detail.xhtml");
		const meta = parseBookDetail(xhtml, "f-scott-fitzgerald/the-great-gatsby");

		expect(meta.author).toBe("F. Scott Fitzgerald");
	});

	it("extracts description", () => {
		const xhtml = loadFixture("book-detail.xhtml");
		const meta = parseBookDetail(xhtml, "f-scott-fitzgerald/the-great-gatsby");

		expect(meta.description).toContain("Gatsby");
		expect(meta.description).toContain("American Dream");
	});

	it("extracts word count", () => {
		const xhtml = loadFixture("book-detail.xhtml");
		const meta = parseBookDetail(xhtml, "f-scott-fitzgerald/the-great-gatsby");

		expect(meta.wordCount).toBe(48465);
	});

	it("extracts cover URLs", () => {
		const xhtml = loadFixture("book-detail.xhtml");
		const meta = parseBookDetail(xhtml, "f-scott-fitzgerald/the-great-gatsby");

		expect(meta.coverUrl).toContain("cover-thumbnail.jpg");
		expect(meta.coverHeroUrl).toContain("cover.jpg");
	});

	it("extracts language", () => {
		const xhtml = loadFixture("book-detail.xhtml");
		const meta = parseBookDetail(xhtml, "f-scott-fitzgerald/the-great-gatsby");

		expect(meta.language).toBe("en-GB");
	});

	it("extracts dates", () => {
		const xhtml = loadFixture("book-detail.xhtml");
		const meta = parseBookDetail(xhtml, "f-scott-fitzgerald/the-great-gatsby");

		expect(meta.datePublished).toBe("2021-01-01");
		expect(meta.dateModified).toBeTruthy();
	});

	it("sets the provided book ID", () => {
		const xhtml = loadFixture("book-detail.xhtml");
		const meta = parseBookDetail(xhtml, "f-scott-fitzgerald/the-great-gatsby");

		expect(meta.id).toBe("f-scott-fitzgerald/the-great-gatsby");
	});
});
