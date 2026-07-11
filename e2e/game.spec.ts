import { expect, test } from "@playwright/test";
import type { GameState } from "../src/lib/game/sim/state";

declare global {
	interface Window {
		__game?: {
			getState(): GameState;
			sendKeys(keys: string): void;
			stepTicks(n: number): void;
			renderReady(): boolean;
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

		// stepping past the opening intermission enters an active wave, so the
		// wave chip should now be mounted in the HUD
		await expect(page.getByTestId("game-wave")).toBeVisible();

		// The full roster fields any tier-1 regular here, and some (e.g. a
		// shielded archetype) absorb a completion by reassigning the word
		// instead of dying — so type the locked target's current word,
		// repeating until it actually dies, instead of assuming one word kills.
		let kills = 0;
		for (let i = 0; i < 5 && kills < 1; i++) {
			const word = await page.evaluate(() => {
				const s = window.__game?.getState();
				if (!s) return undefined;
				const target =
					s.enemies.find((e) => e.id === s.targetId) ?? s.enemies[0];
				return target?.word;
			});
			expect(word).toBeTruthy();
			await page.evaluate((w) => window.__game?.sendKeys(w), word as string);
			kills = (await page.evaluate(() => window.__game?.getState().kills)) ?? 0;
		}

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
		// advance to the deterministic frame first so every enemy mesh (and the
		// textured ground) exists, then wait until the scene is fully ready —
		// async PNG textures decoded and their shader variants compiled — and
		// render once more, so the capture never races an effect Babylon skipped
		// while still building it
		await page.evaluate(() => window.__game?.stepTicks(400));
		await page.waitForFunction(() => window.__game?.renderReady() === true);
		await page.evaluate(() => window.__game?.stepTicks(0));
		await expect(page.locator("canvas")).toHaveScreenshot("horde-arena.png", {
			maxDiffPixelRatio: 0.02,
		});
	});
});
