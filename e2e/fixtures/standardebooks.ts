/**
 * Hermetic Standard Ebooks fixtures for Playwright route stubs.
 *
 * These XHTML strings include only the markup that
 * `src/lib/core/text/se-catalog-parser.ts` and `xhtml-extractor.ts` look
 * for — enough to drive the book-mode E2E without hitting the live SE
 * server.
 */

export const SE_BOOK_ID = "test-author/test-book";

export const catalogXhtml = `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<body>
  <ol>
    <li typeof="schema:Book" about="/ebooks/${SE_BOOK_ID}">
      <a href="/ebooks/${SE_BOOK_ID}">
        <img src="/images/covers/${SE_BOOK_ID}-cover.jpg" alt="cover" />
        <span property="schema:name">Test Book</span>
      </a>
      <p property="schema:author">
        <span property="schema:name">Test Author</span>
      </p>
    </li>
  </ol>
</body>
</html>`;

export const bookDetailXhtml = `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<body>
  <h1 property="schema:name">Test Book</h1>
  <p property="schema:author">
    <span property="schema:name">Test Author</span>
  </p>
  <meta property="schema:description" content="A short fixture book used by E2E tests." />
  <meta property="schema:wordCount" content="200" />
  <meta property="schema:inLanguage" content="en" />
  <meta property="schema:datePublished" content="2026-01-01" />
  <meta property="schema:dateModified" content="2026-01-01" />
  <meta property="schema:image" content="/images/covers/${SE_BOOK_ID}-hero.jpg" />
  <meta property="schema:thumbnailUrl" content="/images/covers/${SE_BOOK_ID}-thumb.jpg" />
</body>
</html>`;

export const tocXhtml = `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<body>
  <ol>
    <li><a href="text/chapter-1">Chapter 1</a></li>
    <li><a href="text/chapter-2">Chapter 2</a></li>
  </ol>
</body>
</html>`;

const lorem =
	"the quick brown fox jumps over the lazy dog and runs along the river bank to a quiet field beyond the old wooden gate";

export const chapter1Xhtml = `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<body>
  <section epub:type="chapter">
    <h2>Chapter the First</h2>
    <p>${lorem}</p>
    <p>${lorem}</p>
  </section>
</body>
</html>`;

export const chapter2Xhtml = `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<body>
  <section epub:type="chapter">
    <h2>Chapter the Second</h2>
    <p>${lorem}</p>
  </section>
</body>
</html>`;
