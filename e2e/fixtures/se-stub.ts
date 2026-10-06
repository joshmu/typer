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
 * Serves Standard Ebooks documents from fixtures and 404s everything else
 * on the host (covers), so no spec ever reaches the live site.
 */
export async function stubStandardEbooks(context: BrowserContext) {
	await context.route("https://standardebooks.org/**", (route) => {
		const xhtml = DOCUMENTS[new URL(route.request().url()).pathname];
		// Standard Ebooks allows any origin, on 200s and 404s alike.
		const headers = { "access-control-allow-origin": "*" };
		return xhtml === undefined
			? route.fulfill({ status: 404, headers, body: "not found" })
			: route.fulfill({
					status: 200,
					contentType: "application/xhtml+xml",
					headers,
					body: xhtml,
				});
	});
}

/** Playwright's `test`, with Standard Ebooks stubbed for every page. */
export const test = base.extend({
	context: async ({ context }, use) => {
		await stubStandardEbooks(context);
		await use(context);
	},
});

export { expect } from "@playwright/test";
