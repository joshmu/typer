import { type BrowserContext, test as base } from "@playwright/test";
import {
	bookDetailXhtml,
	catalogXhtml,
	chapter1Xhtml,
	chapter2Xhtml,
	SE_BOOK_ID,
	tocXhtml,
} from "./standardebooks";

const DOCUMENTS: Record<string, string> = {
	"/ebooks": catalogXhtml,
	[`/ebooks/${SE_BOOK_ID}`]: bookDetailXhtml,
	[`/ebooks/${SE_BOOK_ID}/text`]: tocXhtml,
	[`/ebooks/${SE_BOOK_ID}/text/chapter-1`]: chapter1Xhtml,
	[`/ebooks/${SE_BOOK_ID}/text/chapter-2`]: chapter2Xhtml,
};

/**
 * Serves the /se proxy from fixtures and 404s direct Standard Ebooks
 * requests (covers), so no spec ever reaches the live site.
 */
export async function stubStandardEbooks(context: BrowserContext) {
	await context.route("https://standardebooks.org/**", (route) =>
		route.fulfill({ status: 404, body: "not found" }),
	);
	await context.route(
		(url) => url.pathname.startsWith("/se/"),
		(route) => {
			const path = new URL(route.request().url()).pathname.slice(3);
			const xhtml = DOCUMENTS[path];
			return xhtml === undefined
				? route.fulfill({ status: 404, body: "not found" })
				: route.fulfill({
						status: 200,
						contentType: "application/xhtml+xml",
						body: xhtml,
					});
		},
	);
}

/** Playwright's `test`, with Standard Ebooks stubbed for every page. */
export const test = base.extend({
	context: async ({ context }, use) => {
		await stubStandardEbooks(context);
		await use(context);
	},
});

export { expect } from "@playwright/test";
