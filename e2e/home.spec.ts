import { expect, test } from "./fixtures/se-stub";

test("homepage displays Typer heading", async ({ page }) => {
	await page.goto("/");
	await expect(page.getByRole("banner").getByText("typer")).toBeVisible();
});

test("about page is accessible", async ({ page }) => {
	await page.goto("/about");
	await expect(page.locator("text=About Typer")).toBeVisible();
});

test("the header's horde link opens the game arena", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("link", { name: "horde" }).click();
	await expect(page).toHaveURL(/\/game$/);
	await expect(page.getByTestId("game-shell")).toBeVisible();
	await expect(page.locator("canvas")).toBeVisible();
});

test("the header marks the current page", async ({ page }) => {
	const nav = page.getByRole("navigation", { name: "Main" });
	for (const [path, name] of [
		["/", "type"],
		["/library", "library"],
		["/game", "horde"],
		["/settings", "Settings"],
	] as const) {
		await page.goto(path);
		await expect(nav.getByRole("link", { name, exact: true })).toHaveAttribute(
			"aria-current",
			"page",
		);
		await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
	}
});

test("about moves to a footer link", async ({ page }) => {
	await page.goto("/");
	await page
		.getByRole("contentinfo")
		.getByRole("link", { name: "about" })
		.click();
	await expect(page).toHaveURL(/\/about$/);
});

test("/horde redirects to /game and keeps the query", async ({ page }) => {
	await page.goto("/horde?seed=42&testMode=1");
	await expect(page).toHaveURL(/\/game\?seed=42&testMode=1$/);
	await expect(page.getByTestId("game-shell")).toBeVisible();
});

test("the mode bar holds only the typing modes", async ({ page }) => {
	await page.goto("/");
	const bar = page.getByTestId("mode-selector");
	for (const name of ["time", "words", "quote", "zen", "custom"]) {
		await expect(bar.getByRole("button", { name, exact: true })).toBeVisible();
	}
	for (const name of ["book", "game"]) {
		await expect(bar.getByRole("button", { name, exact: true })).toHaveCount(0);
	}
});
