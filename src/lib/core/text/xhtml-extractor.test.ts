import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractChapterTitle, extractTextFromXHTML } from "./xhtml-extractor";

const fixturesDir = join(__dirname, "__fixtures__");

function loadFixture(name: string): string {
	return readFileSync(join(fixturesDir, name), "utf-8");
}

describe("extractTextFromXHTML", () => {
	it("extracts paragraph text from chapter XHTML", () => {
		const xhtml = loadFixture("chapter-short.xhtml");
		const text = extractTextFromXHTML(xhtml);

		expect(text).toContain(
			"In my younger and more vulnerable years my father gave me some advice",
		);
		expect(text).toContain("just remember that all the people");
	});

	it("strips HTML tags completely", () => {
		const xhtml = loadFixture("chapter-short.xhtml");
		const text = extractTextFromXHTML(xhtml);

		expect(text).not.toContain("<p>");
		expect(text).not.toContain("</p>");
		expect(text).not.toContain("<section");
		expect(text).not.toContain("<h2");
	});

	it("does not include head/metadata content", () => {
		const xhtml = loadFixture("chapter-short.xhtml");
		const text = extractTextFromXHTML(xhtml);

		expect(text).not.toContain("viewport");
		expect(text).not.toContain("stylesheet");
		expect(text).not.toContain("css");
	});

	it("normalizes smart quotes to straight quotes", () => {
		const xhtml = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<body><section epub:type="chapter">
<p>\u201CHello,\u201D she said. \u201CIt\u2019s nice.\u201D</p>
</section></body></html>`;
		const text = extractTextFromXHTML(xhtml);

		expect(text).toContain('"Hello,"');
		expect(text).toContain("It's");
		expect(text).not.toContain("\u201C");
		expect(text).not.toContain("\u201D");
		expect(text).not.toContain("\u2019");
	});

	it("normalizes em dashes", () => {
		const xhtml = loadFixture("chapter-short.xhtml");
		const text = extractTextFromXHTML(xhtml);

		// The fixture has ⁠— (word joiner + em dash + word joiner)
		// Should be normalized to --
		expect(text).toContain("--");
		expect(text).not.toContain("\u2014"); // em dash
		expect(text).not.toContain("\u2060"); // word joiner
	});

	it("separates paragraphs with spaces", () => {
		const xhtml = loadFixture("chapter-short.xhtml");
		const text = extractTextFromXHTML(xhtml);

		// Paragraphs should be joined with spaces, not run together
		// "ever since." should be followed by a space and then the next paragraph
		expect(text).toMatch(/ever since\.\s+/);
	});

	it("collapses multiple whitespace into single spaces", () => {
		const xhtml = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<body><section epub:type="chapter">
<p>Hello   world.    How   are   you?</p>
</section></body></html>`;
		const text = extractTextFromXHTML(xhtml);

		expect(text).toBe("Hello world. How are you?");
	});

	it("handles the full chapter fixture", () => {
		const xhtml = loadFixture("chapter.xhtml");
		const text = extractTextFromXHTML(xhtml);

		// Should have substantial content
		expect(text.length).toBeGreaterThan(1000);
		// First line of the novel
		expect(text).toContain(
			"In my younger and more vulnerable years",
		);
		// Should not contain any nav/header content
		expect(text).not.toContain("Standard Ebooks");
		expect(text).not.toContain("Back to ebook");
	});

	it("strips abbr tags but keeps their text content", () => {
		const xhtml = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<body><section epub:type="chapter">
<p><abbr epub:type="z3998:name-title">Mr.</abbr> Gatsby was there.</p>
</section></body></html>`;
		const text = extractTextFromXHTML(xhtml);

		expect(text).toBe("Mr. Gatsby was there.");
	});

	it("returns empty string for content with no chapter section", () => {
		const xhtml = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<body>
<section epub:type="colophon">
<p>This is a colophon.</p>
</section>
</body></html>`;
		const text = extractTextFromXHTML(xhtml);

		expect(text).toBe("");
	});
});

describe("extractChapterTitle", () => {
	it("extracts the chapter title from XHTML", () => {
		const xhtml = loadFixture("chapter-short.xhtml");
		const title = extractChapterTitle(xhtml);

		expect(title).toBe("I");
	});

	it("extracts title from h2 element", () => {
		const xhtml = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<body><section epub:type="chapter">
<h2>Chapter One: The Beginning</h2>
<p>Text here.</p>
</section></body></html>`;
		const title = extractChapterTitle(xhtml);

		expect(title).toBe("Chapter One: The Beginning");
	});

	it("returns a default when no title found", () => {
		const xhtml = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<body><section epub:type="chapter">
<p>No title here.</p>
</section></body></html>`;
		const title = extractChapterTitle(xhtml);

		expect(title).toBe("Untitled Chapter");
	});
});
