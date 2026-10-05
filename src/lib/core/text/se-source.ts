/** Standard Ebooks, the source of every book. Covers load from here directly. */
export const SE_ORIGIN = "https://standardebooks.org";

/**
 * Same-origin path that proxies Standard Ebooks documents (catalogue, book
 * pages, chapters), so no fetch depends on its CORS headers. Vercel rewrites
 * it in production (vercel.json); Vite proxies it in dev and preview.
 */
export const SE_PROXY_PATH = "/se";
