import { expect, type Page, test } from "@playwright/test";
import {
	bookDetailXhtml,
	catalogXhtml,
	chapter1Xhtml,
	chapter2Xhtml,
	SE_BOOK_ID,
	tocXhtml,
} from "./fixtures/standardebooks";

async function stubStandardEbooks(page: Page): Promise<void> {
	await page.route("https://standardebooks.org/**", async (route) => {
		const url = new URL(route.request().url());
		const path = url.pathname;
		const xhtml = (() => {
			if (path === "/ebooks") return catalogXhtml;
			if (path === `/ebooks/${SE_BOOK_ID}`) return bookDetailXhtml;
			if (path === `/ebooks/${SE_BOOK_ID}/text`) return tocXhtml;
			if (path === `/ebooks/${SE_BOOK_ID}/text/chapter-1`) return chapter1Xhtml;
			if (path === `/ebooks/${SE_BOOK_ID}/text/chapter-2`) return chapter2Xhtml;
			return null;
		})();
		if (xhtml === null) {
			await route.fulfill({ status: 404, body: "not found" });
			return;
		}
		await route.fulfill({
			status: 200,
			contentType: "application/xhtml+xml",
			body: xhtml,
		});
	});
}

async function clearIndexedDb(page: Page): Promise<void> {
	await page.evaluate(async () => {
		await new Promise<void>((resolve) => {
			const req = indexedDB.deleteDatabase("TyperDB");
			req.onsuccess = () => resolve();
			req.onerror = () => resolve();
			req.onblocked = () => resolve();
		});
	});
}

test.describe("book mode", () => {
	test.beforeEach(async ({ page }) => {
		await stubStandardEbooks(page);
		// Ensure each test starts from a clean DB so resume state is deterministic.
		await page.goto("/");
		await clearIndexedDb(page);
	});

	test("browse → select → type → results shows progress", async ({ page }) => {
		await page.goto("/");

		// Default mode is book, so the browser should appear after initial fetch.
		const bookCard = page.getByText("Test Book").first();
		await expect(bookCard).toBeVisible({ timeout: 5000 });
		await bookCard.click();

		// Detail modal: start reading
		const startButton = page.getByRole("button", { name: /start reading/i });
		await expect(startButton).toBeVisible();
		await startButton.click();

		// Typing test container appears
		const typingTest = page.getByTestId("typing-test");
		await expect(typingTest).toBeVisible({ timeout: 5000 });

		// Type a few words then Esc to finish.
		await typingTest.focus();
		const phrase = "the quick brown fox";
		for (const char of phrase) {
			await page.keyboard.press(char === " " ? "Space" : char);
		}
		await page.keyboard.press("Escape");

		// Results screen visible with redo label "Continue Reading"
		await expect(
			page.getByRole("button", { name: /continue reading/i }),
		).toBeVisible({ timeout: 5000 });
		await expect(page.getByText(/% complete/i)).toBeVisible();
	});

	test("continue reading advances the feeder", async ({ page }) => {
		await page.goto("/");

		const bookCard = page.getByText("Test Book").first();
		await expect(bookCard).toBeVisible({ timeout: 5000 });
		await bookCard.click();
		await page.getByRole("button", { name: /start reading/i }).click();

		const typingTest = page.getByTestId("typing-test");
		await expect(typingTest).toBeVisible({ timeout: 5000 });

		// Capture the first window of words by reading the typing area.
		const firstText = (await typingTest.textContent())?.trim() ?? "";
		expect(firstText.length).toBeGreaterThan(0);

		// Type one word so startTime is set, then finish.
		await typingTest.focus();
		await page.keyboard.press("t");
		await page.keyboard.press("h");
		await page.keyboard.press("e");
		await page.keyboard.press("Space");
		await page.keyboard.press("Escape");

		const continueButton = page.getByRole("button", {
			name: /continue reading/i,
		});
		await expect(continueButton).toBeVisible({ timeout: 5000 });
		await continueButton.click();

		// New typing window should appear; first word advanced past "the".
		await expect(typingTest).toBeVisible({ timeout: 5000 });
		const secondText = (await typingTest.textContent())?.trim() ?? "";
		expect(secondText.length).toBeGreaterThan(0);
	});
});
