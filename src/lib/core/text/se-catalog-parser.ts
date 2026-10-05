import type { BookMeta } from "../types/book";

const SE_BASE = "https://standardebooks.org";

function absoluteUrl(url: string): string {
	return url.startsWith("/") ? `${SE_BASE}${url}` : url;
}

const ENTITIES: Record<string, string> = {
	"&amp;": "&",
	"&quot;": '"',
	"&apos;": "'",
	"&lt;": "<",
	"&gt;": ">",
};

function decodeEntities(text: string): string {
	return text
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#x([\da-f]+);/gi, (_, code) =>
			String.fromCodePoint(Number.parseInt(code, 16)),
		)
		.replace(/&(amp|quot|apos|lt|gt);/g, (m) => ENTITIES[m]);
}

/**
 * The book's long description (the page's Description section) as plain
 * paragraphs separated by blank lines, or "" when the page has none.
 */
function parseLongDescription(xhtml: string): string {
	const start = xhtml.search(/<section[^>]*id="description"/i);
	if (start < 0) return "";
	const rest = xhtml.slice(start + 1);
	const end = rest.search(/<\/section>|<section/i);
	const section = (end < 0 ? rest : rest.slice(0, end)).replace(
		/<aside[\s\S]*?<\/aside>/gi,
		"",
	);
	const paragraphs = [...section.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
		.map((m) =>
			decodeEntities(m[1].replace(/<[^>]+>/g, ""))
				.replace(/\s+/g, " ")
				.trim(),
		)
		.filter(Boolean);
	return paragraphs.join("\n\n");
}

/**
 * Parse the Standard Ebooks catalog listing page XHTML into BookMeta[].
 * Extracts data from schema.org-annotated list items.
 */
export function parseCatalogPage(xhtml: string): BookMeta[] {
	const books: BookMeta[] = [];

	// Match each book entry: <li ... typeof="schema:Book" about="/ebooks/...">
	const entryRegex =
		/<li[^>]*typeof="schema:Book"[^>]*about="\/ebooks\/([^"]+)"[^>]*>([\s\S]*?)<\/li>/gi;

	for (const match of xhtml.matchAll(entryRegex)) {
		const id = match[1];
		const content = match[2];

		// Extract title: <span property="schema:name">Title</span>
		const titleMatch = /property="schema:name">([^<]+)<\/span>/i.exec(content);
		const title = titleMatch?.[1]?.trim() ?? "";

		// Extract author: within property="schema:author" context
		const authorSection = /property="schema:author"([\s\S]*?)<\/p>/i.exec(
			content,
		);
		let author = "";
		if (authorSection) {
			const authorName = /property="schema:name">([^<]+)<\/span>/i.exec(
				authorSection[1],
			);
			author = authorName?.[1]?.trim() ?? "";
		}

		// Extract cover image URL
		const imgMatch = /src="(\/images\/covers\/[^"]+\.jpg)"/i.exec(content);
		const coverUrl = imgMatch ? imgMatch[1] : "";

		if (title) {
			books.push({
				id,
				title,
				author,
				description: "",
				language: "en",
				wordCount: 0,
				coverUrl: coverUrl ? `${SE_BASE}${coverUrl}` : "",
				coverHeroUrl: "",
				chapters: [],
				datePublished: "",
				dateModified: "",
			});
		}
	}

	return books;
}

/**
 * Parse the chapter list from a book's /text endpoint (TOC page).
 * Returns only chapter filenames, excluding front/back matter.
 */
export function parseChapterList(xhtml: string): string[] {
	const chapters: string[] = [];

	// Match links to chapter files: href="text/chapter-N"
	const linkRegex = /href="text\/(chapter-[^"]+)"/gi;

	for (const match of xhtml.matchAll(linkRegex)) {
		const filename = match[1];
		if (!chapters.includes(filename)) {
			chapters.push(filename);
		}
	}

	return chapters;
}

/**
 * Parse the book detail page for full metadata.
 * Uses schema.org properties embedded as meta tags and inline attributes.
 */
export function parseBookDetail(xhtml: string, bookId: string): BookMeta {
	function schemaContent(property: string): string {
		const regex = new RegExp(
			`property="schema:${property}"[^>]*content="([^"]*)"`,
			"i",
		);
		const match = regex.exec(xhtml);
		return match?.[1] ?? "";
	}

	// Title: h1 with schema:name property
	const titleMatch = /<h1[^>]*property="schema:name"[^>]*>([^<]+)<\/h1>/i.exec(
		xhtml,
	);
	const title = titleMatch?.[1]?.trim() ?? "";

	// Author: within schema:author context
	const authorSection = /property="schema:author"([\s\S]*?)<\/p>/i.exec(xhtml);
	let author = "";
	if (authorSection) {
		const authorName = /property="schema:name">([^<]+)<\/span>/i.exec(
			authorSection[1],
		);
		author = authorName?.[1]?.trim() ?? "";
	}

	// Newer pages carry the summary as schema:abstract; later
	// schema:description metas name download formats ("epub").
	const description = decodeEntities(
		schemaContent("abstract") || schemaContent("description"),
	);
	const wordCountStr = schemaContent("wordCount");
	const wordCount = wordCountStr ? Number.parseInt(wordCountStr, 10) : 0;
	const language = schemaContent("inLanguage");
	const datePublished = schemaContent("datePublished");
	const dateModified = schemaContent("dateModified");
	const coverHeroUrl = absoluteUrl(schemaContent("image"));
	const coverUrl = absoluteUrl(schemaContent("thumbnailUrl"));

	return {
		id: bookId,
		title,
		author,
		description,
		longDescription: parseLongDescription(xhtml),
		language,
		wordCount,
		coverUrl,
		coverHeroUrl,
		chapters: [],
		datePublished,
		dateModified,
	};
}
