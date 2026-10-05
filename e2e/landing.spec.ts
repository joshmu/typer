import { expect, test } from "./fixtures/se-stub";

const tab = (page: import("@playwright/test").Page, name: string) =>
	page.getByRole("button", { name, exact: true });

test("a first visit lands on a ready time 30 test", async ({ page }) => {
	await page.goto("/");
	const typingTest = page.getByTestId("typing-test");
	await expect(typingTest).toBeVisible();
	await expect(typingTest).toBeFocused();
	await expect(tab(page, "time")).toHaveAttribute("aria-pressed", "true");
	await expect(tab(page, "30s")).toHaveAttribute("aria-pressed", "true");

	// type to start: no click needed
	await page.keyboard.type("x");
	await expect(page.getByTestId("mode-selector")).toHaveClass(/opacity-0/);
});

test("with no book in progress, the card leads to the library", async ({
	page,
}) => {
	await page.goto("/");
	const link = page.getByRole("link", { name: /type a classic book/i });
	await expect(link).toBeVisible();
	await link.click();
	await expect(page).toHaveURL(/\/library$/);
	await expect(page.getByText("Test Book").first()).toBeVisible();
});

test("the card is reached with Shift+Tab and hides while typing", async ({
	page,
}) => {
	await page.goto("/");
	await expect(page.getByTestId("typing-test")).toBeFocused();
	const link = page.getByRole("link", { name: /type a classic book/i });
	await expect(link).toBeVisible();

	await page.keyboard.press("Shift+Tab");
	await expect(link).toBeFocused();

	await page.getByTestId("typing-test").focus();
	await page.keyboard.type("x");
	await expect(page.getByTestId("continue-card")).toHaveAttribute("inert", "");
});

test("Tab and Shift+Tab stay in the typing area mid-test", async ({ page }) => {
	await page.goto("/");
	const typingTest = page.getByTestId("typing-test");
	await expect(typingTest).toBeFocused();
	await page.keyboard.type("x");
	await page.keyboard.press("Shift+Tab");
	await expect(typingTest).toBeFocused();
	await page.keyboard.press("Tab");
	await expect(typingTest).toBeFocused();
});

test("a returning visit restores the last mode and sub-option", async ({
	page,
}) => {
	await page.goto("/");
	await tab(page, "words").click();
	await tab(page, "50").click();
	await expect(tab(page, "50")).toHaveAttribute("aria-pressed", "true");

	await page.reload();
	await expect(tab(page, "words")).toHaveAttribute("aria-pressed", "true");
	await expect(tab(page, "50")).toHaveAttribute("aria-pressed", "true");
	await expect(
		page.locator('[data-testid="text-display"] > div > span'),
	).toHaveCount(50);
});

test("custom falls back to a time test on the next visit", async ({ page }) => {
	await page.goto("/");
	await tab(page, "custom").click();
	await expect(page.getByTestId("text-input")).toBeVisible();

	await page.reload();
	await expect(tab(page, "time")).toHaveAttribute("aria-pressed", "true");
	await expect(page.getByTestId("typing-test")).toBeVisible();
});

test.describe("on a narrow screen", () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test("a dismissible note says Typer wants a keyboard", async ({ page }) => {
		await page.goto("/");
		const note = page.getByTestId("small-screen-notice");
		await expect(note).toContainText("built for a keyboard");
		// the page makes room, so the note never covers the footer for good
		await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
		const about = page
			.getByRole("contentinfo")
			.getByRole("link", { name: "about" });
		const [aboutBox, noteBox] = [
			await about.boundingBox(),
			await note.boundingBox(),
		];
		expect((aboutBox?.y ?? 0) + (aboutBox?.height ?? 0)).toBeLessThanOrEqual(
			noteBox?.y ?? 0,
		);
		await note.getByRole("button", { name: "Dismiss" }).click();
		await expect(note).toHaveCount(0);

		await page.reload();
		await expect(page.getByTestId("typing-test")).toBeVisible();
		await expect(note).toHaveCount(0);
	});

	test("the library stays browsable", async ({ page }) => {
		await page.goto("/library");
		await expect(page.getByText("Test Book").first()).toBeVisible();
	});

	test("the note never covers the book sheet's Start button", async ({
		page,
	}) => {
		await page.goto("/library");
		await page.getByText("Test Book").first().click();
		const start = page.getByRole("button", { name: /start reading/i });
		await expect(start).toBeVisible();
		await expect(page.getByTestId("small-screen-notice")).toBeVisible();
		const onTop = await start.evaluate((button) => {
			const box = button.getBoundingClientRect();
			const hit = document.elementFromPoint(
				box.left + box.width / 2,
				box.top + box.height / 2,
			);
			return hit !== null && button.contains(hit);
		});
		expect(onTop).toBe(true);
	});
});

test("a wide screen shows no keyboard note", async ({ page }) => {
	await page.goto("/");
	await expect(page.getByTestId("typing-test")).toBeVisible();
	await expect(page.getByTestId("small-screen-notice")).toBeHidden();
});
