/**
 * Extract clean plain text from Standard Ebooks chapter XHTML.
 *
 * Only extracts content from <section ... epub:type="chapter"> elements,
 * ignoring navigation, colophons, imprints, and other non-chapter content.
 *
 * Uses regex-based parsing to avoid DOM/namespace issues across environments.
 */
export function extractTextFromXHTML(xhtml: string): string {
	// Find chapter sections — SE marks them with epub:type containing "chapter"
	const chapterRegex =
		/<section[^>]*epub:type="[^"]*chapter[^"]*"[^>]*>([\s\S]*?)<\/section>/gi;
	const chapters: string[] = [];

	for (const match of xhtml.matchAll(chapterRegex)) {
		chapters.push(match[1]);
	}

	if (chapters.length === 0) return "";

	const paragraphs: string[] = [];

	for (const chapter of chapters) {
		// Extract text from <p> and <blockquote> elements (not headings for body text)
		const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
		for (const pMatch of chapter.matchAll(pRegex)) {
			const text = stripTags(pMatch[1]).trim();
			if (text) {
				paragraphs.push(text);
			}
		}
	}

	const raw = paragraphs.join(" ");
	return normalizeBookText(raw);
}

/**
 * Extract the chapter title from Standard Ebooks chapter XHTML.
 * Looks for h2/h3 elements within a chapter section.
 */
export function extractChapterTitle(xhtml: string): string {
	// Find chapter section
	const chapterMatch =
		/<section[^>]*epub:type="[^"]*chapter[^"]*"[^>]*>([\s\S]*?)<\/section>/i.exec(
			xhtml,
		);
	if (!chapterMatch) return "Untitled Chapter";

	const content = chapterMatch[1];

	// Try h2 first, then h3
	const headingMatch =
		/<h2[^>]*>([\s\S]*?)<\/h2>/i.exec(content) ??
		/<h3[^>]*>([\s\S]*?)<\/h3>/i.exec(content);

	if (!headingMatch) return "Untitled Chapter";

	const title = stripTags(headingMatch[1]).trim();
	return title || "Untitled Chapter";
}

/**
 * Strip all HTML tags from a string, preserving text content.
 */
function stripTags(html: string): string {
	return html.replace(/<[^>]+>/g, "");
}

/**
 * Normalize text extracted from XHTML for typing practice:
 * - Smart quotes → straight quotes
 * - Em dashes → --
 * - Word joiners and zero-width spaces removed
 * - Multiple whitespace collapsed
 */
function normalizeBookText(text: string): string {
	return (
		text
			// Smart double quotes → straight
			.replace(/[\u201C\u201D\u201E\u201F]/g, '"')
			// Smart single quotes / apostrophes → straight
			.replace(/[\u2018\u2019\u201A\u201B]/g, "'")
			// Em dash (with optional word joiners) → --
			.replace(/[\u2060]?\u2014[\u2060]?/g, "--")
			// En dash → -
			.replace(/\u2013/g, "-")
			// Ellipsis character → ...
			.replace(/\u2026/g, "...")
			// Remove word joiners and zero-width spaces
			.replace(/[\u2060\u200B\uFEFF]/g, "")
			// Collapse multiple spaces/whitespace
			.replace(/\s+/g, " ")
			.trim()
	);
}
