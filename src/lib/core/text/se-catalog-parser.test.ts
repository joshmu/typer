import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
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
		const dickensBooks = books.filter((b) => b.author === "Charles Dickens");
		expect(dickensBooks.length).toBeGreaterThan(0);
	});
});

describe("parseChapterList", () => {
	// A collection (Ring Lardner's Short Fiction): one file per story, no chapter-N.
	const collectionToc = `<nav id="toc"><ol>
<li><a href="text/titlepage">Titlepage</a></li>
<li><a href="text/imprint">Imprint</a></li>
<li><a href="text/my-roomy">My Roomy</a><ol>
<li><a href="text/my-roomy#my-roomy-1">I</a></li>
<li><a href="text/my-roomy#my-roomy-2">II</a></li></ol></li>
<li><a href="text/sick-em">Sick 'Em</a></li>
<li><a href="text/haircut">Haircut</a></li>
<li><a href="text/endnotes">Endnotes</a></li>
<li><a href="text/colophon">Colophon</a></li>
<li><a href="text/uncopyright">Uncopyright</a></li>
</ol></nav>`;

	it("reads a collection's story files when there are no chapter files", () => {
		expect(parseChapterList(collectionToc)).toEqual([
			"my-roomy",
			"sick-em",
			"haircut",
		]);
	});

	it("keeps only chapter files when a book has them", () => {
		const toc = `<a href="text/preface">Preface</a><a href="text/chapter-1">I</a><a href="text/chapter-2">II</a>`;
		expect(parseChapterList(toc)).toEqual(["chapter-1", "chapter-2"]);
	});

	it("finds nothing in a table of contents with only front and back matter", () => {
		const toc = `<a href="text/titlepage">T</a><a href="text/colophon">C</a>`;
		expect(parseChapterList(toc)).toEqual([]);
	});

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

	it("reads the summary from schema:abstract, not a download format", () => {
		const xhtml = `<h1 property="schema:name">Oberland</h1>
<meta property="schema:abstract" content="A young woman &amp; her trip to Switzerland."/>
<div property="schema:description"><p>Long description.</p></div>
<meta property="schema:description" content="epub"/>`;
		const meta = parseBookDetail(xhtml, "a/b");

		expect(meta.description).toBe("A young woman & her trip to Switzerland.");
	});

	it("makes site-relative cover URLs absolute", () => {
		const xhtml = `<meta property="schema:image" content="/images/covers/a-hero.jpg"/>
<meta property="schema:thumbnailUrl" content="/images/covers/a-thumb.jpg"/>`;
		const meta = parseBookDetail(xhtml, "a/b");

		expect(meta.coverHeroUrl).toBe(
			"https://standardebooks.org/images/covers/a-hero.jpg",
		);
		expect(meta.coverUrl).toBe(
			"https://standardebooks.org/images/covers/a-thumb.jpg",
		);
	});

	it("extracts the long description as plain paragraphs", () => {
		const xhtml = loadFixture("book-detail.xhtml");
		const meta = parseBookDetail(xhtml, "f-scott-fitzgerald/the-great-gatsby");
		const paragraphs = meta.longDescription?.split("\n\n") ?? [];

		expect(paragraphs.length).toBe(6);
		expect(paragraphs[0]).toMatch(/^The Great Gatsby is a novel/);
		expect(paragraphs[1]).toMatch(/^Nick Carraway/);
		expect(meta.longDescription).not.toContain("donation");
		expect(meta.longDescription).not.toContain("<");
	});

	it("reads the long description from the schema:description block", () => {
		const xhtml = `<section id="description">
<h2>Description</h2>
<aside class="donation"><p>Please donate.</p></aside>
<div property="schema:description">
<p><i>Oberland</i> is the ninth &#8220;chapter volume&#8221;.</p>
<p>Miriam takes a  trip &amp; skis.</p>
</div>
</section>`;
		const meta = parseBookDetail(xhtml, "a/b");

		expect(meta.longDescription).toBe(
			"Oberland is the ninth \u201cchapter volume\u201d.\n\nMiriam takes a trip & skis.",
		);
	});

	it("leaves the long description empty when the page has none", () => {
		expect(parseBookDetail("<h1>x</h1>", "a/b").longDescription).toBe("");
	});

	it("sets the provided book ID", () => {
		const xhtml = loadFixture("book-detail.xhtml");
		const meta = parseBookDetail(xhtml, "f-scott-fitzgerald/the-great-gatsby");

		expect(meta.id).toBe("f-scott-fitzgerald/the-great-gatsby");
	});
});
