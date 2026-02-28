import { expect, test } from "@playwright/test";

test("homepage displays Typer heading", async ({ page }) => {
	await page.goto("/");
	await expect(page.locator("text=Typer")).toBeVisible();
});

test("about page is accessible", async ({ page }) => {
	await page.goto("/about");
	await expect(page.locator("text=About Typer")).toBeVisible();
});
