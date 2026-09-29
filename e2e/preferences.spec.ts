import { expect, type Page, test } from "@playwright/test";

const TEXT = "the quick brown fox";

async function startCustomTest(page: Page) {
	await page.goto("/");
	await page.getByRole("button", { name: "custom" }).click();
	await page.getByTestId("text-input").fill(TEXT);
	await page.getByTestId("start-button").click();
	const typingTest = page.getByTestId("typing-test");
	await expect(typingTest).toBeVisible();
	await typingTest.focus();
}

const caret = (page: Page) => page.getByTestId("caret");

test("selecting a theme applies it and it survives a reload", async ({
	page,
}) => {
	await page.goto("/settings");
	await page.getByRole("button", { name: "Dracula" }).click();
	await expect(page.locator("html")).toHaveAttribute("data-theme", "dracula");
	await page.reload();
	await expect(page.locator("html")).toHaveAttribute("data-theme", "dracula");
});

test("caret style changes the caret", async ({ page }) => {
	await startCustomTest(page);
	expect((await caret(page).boundingBox())?.width).toBe(2);

	await page.goto("/settings");
	await page.getByRole("button", { name: "block" }).click();
	await startCustomTest(page);
	expect((await caret(page).boundingBox())?.width).toBeGreaterThan(2);
});

test("smooth caret off stops animating the caret", async ({ page }) => {
	await startCustomTest(page);
	await expect(caret(page)).toHaveClass(/transition-/);

	await page.goto("/settings");
	await page.getByRole("button", { name: "Smooth caret" }).click();
	await startCustomTest(page);
	await expect(caret(page)).not.toHaveClass(/transition-/);
});

test("live WPM off hides the WPM counter", async ({ page }) => {
	await page.goto("/settings");
	await page.getByRole("button", { name: "Live WPM" }).click();
	await startCustomTest(page);
	await page.keyboard.type("the ");

	const stats = page.getByTestId("stats-bar");
	await expect(stats).toBeVisible();
	await expect(stats).not.toContainText("wpm");
});

test("font size resizes the text and the caret stays on the next character", async ({
	page,
}) => {
	await startCustomTest(page);
	const display = page.getByTestId("text-display");
	await expect(display).toHaveCSS("font-size", "24px");

	await page.goto("/settings");
	await page.getByRole("button", { name: "30px" }).click();
	await startCustomTest(page);
	await expect(display).toHaveCSS("font-size", "30px");

	await page.keyboard.type("the q");
	const next = display
		.locator(":scope > div > span")
		.nth(1)
		.locator("span")
		.nth(1);
	await expect
		.poll(async () => {
			const c = await caret(page).boundingBox();
			const n = await next.boundingBox();
			if (!c || !n) return null;
			return {
				left: Math.abs(Math.round(c.x - n.x)),
				top: Math.abs(Math.round(c.y - n.y)),
			};
		})
		.toEqual({ left: 0, top: 0 });
});

test("settings has no sound toggle", async ({ page }) => {
	await page.goto("/settings");
	await expect(page.getByRole("button", { name: "Live WPM" })).toBeVisible();
	await expect(page.getByText("Sound on keypress")).toHaveCount(0);
});
