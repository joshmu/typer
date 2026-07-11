import { expect, test } from "@playwright/test";
import type { GameState } from "../src/lib/game/sim/state";

declare global {
	interface Window {
		__game?: {
			getState(): GameState;
			sendKeys(keys: string): void;
			stepTicks(n: number): void;
		};
	}
}

test.describe("horde game mode", () => {
	test("loads arena and kills first enemy by typing", async ({ page }) => {
		await page.goto("/game?seed=42&testMode=1");
		await expect(page.getByTestId("game-shell")).toBeVisible();
		await page.waitForFunction(() => window.__game !== undefined);

		// advance past first spawn deterministically
		await page.evaluate(() => window.__game?.stepTicks(181));
		const word = await page.evaluate(
			() => window.__game?.getState().enemies[0].word,
		);
		expect(word).toBeTruthy();
		await page.evaluate((w) => window.__game?.sendKeys(w), word as string);

		await expect(page.getByTestId("game-kills")).toHaveText("kills 1");
		const state = await page.evaluate(() => window.__game?.getState());
		expect(state?.kills).toBe(1);
	});

	test("visual: deterministic arena frame", async ({ page }) => {
		// Baseline exists for darwin only while skeleton visuals churn;
		// linux CI baseline lands at visual-freeze (render polish plan).
		test.skip(
			process.platform !== "darwin",
			"linux baseline added at visual-freeze",
		);
		await page.goto("/game?seed=42&testMode=1");
		await page.waitForFunction(() => window.__game !== undefined);
		await page.evaluate(() => window.__game?.stepTicks(400));
		await expect(page.locator("canvas")).toHaveScreenshot("horde-arena.png", {
			maxDiffPixelRatio: 0.02,
		});
	});
});
