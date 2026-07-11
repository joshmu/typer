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
				return target ? target.words[target.wordIndex] : undefined;
			});
			expect(word).toBeTruthy();
			await page.evaluate((w) => window.__game?.sendKeys(w), word as string);
			kills = (await page.evaluate(() => window.__game?.getState().kills)) ?? 0;
		}

		await expect(page.getByTestId("game-kills")).toHaveText("kills 1");
		const state = await page.evaluate(() => window.__game?.getState());
		expect(state?.kills).toBe(1);
	});

	test("holds the sim at tick 0 behind the start overlay", async ({ page }) => {
		// NON-testMode load (a real session): the loop renders the scene but must
		// not advance the sim until the player starts. window.__game is
		// testMode-only, so assert on the DOM instead — a running sim flips to an
		// active wave (mounting the wave chip) within ~1s, so if it stays hidden
		// across a 2s wait the sim never advanced.
		await page.goto("/game?seed=42");
		await expect(page.getByTestId("game-start")).toBeVisible();
		await page.waitForTimeout(2000);
		await expect(page.getByTestId("game-start")).toBeVisible();
		await expect(page.getByTestId("game-wave")).toBeHidden();
		await expect(page.getByTestId("game-over")).toBeHidden();
	});

	test("shows the death screen with run stats and restarts", async ({
		page,
	}) => {
		await page.goto("/game?seed=42&testMode=1");
		await expect(page.getByTestId("game-shell")).toBeVisible();
		await page.waitForFunction(() => window.__game !== undefined);

		// drive the sim untyped until the horde overruns the core — bounded per
		// poll so a single evaluate never spins unboundedly
		// larger arena + survivable pacing (Task 1) means the horde takes far more
		// ticks to overrun the core, so drive a bigger chunk per poll to keep the
		// whole drive comfortably inside the wall-clock timeout
		await page.waitForFunction(
			() => {
				const g = window.__game;
				if (!g) return false;
				if (g.getState().status === "gameover") return true;
				g.stepTicks(400);
				return g.getState().status === "gameover";
			},
			null,
			{ timeout: 30000, polling: 100 },
		);

		await expect(page.getByTestId("game-over")).toBeVisible();
		await expect(page.getByTestId("game-over-score")).toBeVisible();
		await expect(page.getByTestId("game-over-wpm")).toBeVisible();
		await expect(page.getByTestId("game-restart")).toBeVisible();

		// restart via keyboard R — fresh loop, HUD reset to a running tick-0 state
		await page.keyboard.press("r");
		await page.waitForFunction(() => {
			const s = window.__game?.getState();
			return s?.status === "running" && s.tick === 0;
		});
		await expect(page.getByTestId("game-over")).toBeHidden();
		await expect(page.getByTestId("game-kills")).toHaveText("kills 0");
		await expect(page.getByTestId("game-score")).toHaveText("score 0");
	});

	test("visual: deterministic arena frame", async ({ page }) => {
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
