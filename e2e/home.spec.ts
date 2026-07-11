import { expect, test } from "@playwright/test";

test("homepage displays Typer heading", async ({ page }) => {
	await page.goto("/");
	await expect(page.locator("text=Typer")).toBeVisible();
});

test("about page is accessible", async ({ page }) => {
	await page.goto("/about");
	await expect(page.locator("text=About Typer")).toBeVisible();
});

test("horde mode entry navigates from home to the game arena", async ({
	page,
}) => {
	await page.goto("/");
	await page.getByTestId("mode-horde").click();
	await expect(page).toHaveURL(/\/game$/);
	await expect(page.getByTestId("game-shell")).toBeVisible();
	await expect(page.locator("canvas")).toBeVisible();
});
