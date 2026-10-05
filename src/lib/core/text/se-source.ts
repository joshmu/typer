/**
 * Standard Ebooks, the source of every book. Documents and covers are fetched
 * straight from it (it answers with `Access-Control-Allow-Origin: *`); there is
 * no same-origin proxy because it blocks Vercel's egress with a 403.
 */
export const SE_ORIGIN = "https://standardebooks.org";
