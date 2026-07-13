import { expect, test } from "@playwright/test";
import type { GameState } from "../src/lib/game/sim/state";

declare global {
	interface Window {
		__game?: {
			getState(): GameState;
			sendKeys(keys: string): void;
			sendBackspace(): void;
			sendPerk(index: number): void;
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

	test("spawn-ring vignette overlays the arena and tracks canvas size", async ({
		page,
	}) => {
		await page.goto("/game?seed=42&testMode=1");
		await page.waitForFunction(() => window.__game !== undefined);
		const vignette = page.getByTestId("game-vignette");
		await expect(vignette).toBeVisible();
		// a world-radius radial gradient: transparent centre, near-opaque past the
		// spawn ring, so enemies emerge from darkness instead of popping in
		const bg = await vignette.evaluate(
			(el) => getComputedStyle(el).backgroundImage,
		);
		expect(bg).toContain("radial-gradient");
		// gradient is sized from the live canvas, so a resize must rescale it
		await page.setViewportSize({ width: 800, height: 500 });
		const bgSmall = await vignette.evaluate(
			(el) => getComputedStyle(el).backgroundImage,
		);
		expect(bgSmall).toContain("radial-gradient");
		expect(bgSmall).not.toBe(bg);
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
		//
		// Nothing is ever typed here, but a wave can still "clear" when every
		// spawned enemy breaches the core untyped (alive count hits 0 same as a
		// typed clear) — the roguelite perk draft freezes the sim in that phase
		// until a perk event arrives, so auto-pick card 0 whenever we land there
		// or the drive would stall forever short of gameover.
		await page.waitForFunction(
			() => {
				const g = window.__game;
				if (!g) return false;
				if (g.getState().status === "gameover") return true;
				if (g.getState().wavePhase === "perk-choice") g.sendPerk(0);
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

	test("free-flow: switch mid-word to another enemy, then return and finish both", async ({
		page,
	}) => {
		await page.goto("/game?seed=42&testMode=1");
		await page.waitForFunction(() => window.__game !== undefined);
		await page.evaluate(() => window.__game?.stepTicks(181));

		// Run the whole scenario in-page so each keystroke's routing is observed
		// without cross-process races. A = the NEAREST enemy (so a resume keystroke
		// re-acquires it deterministically); B = another enemy whose initial won't
		// merely continue A.
		const r = await page.evaluate(() => {
			const g = window.__game;
			if (!g) return { error: "no game" };
			const cw = (e: { words: string[]; wordIndex: number }) =>
				e.words[e.wordIndex];
			const alive = () => g.getState().enemies.filter((e) => e.alive);
			let guard = 0;
			while (alive().length < 2 && guard++ < 400) g.stepTicks(20);
			const as = alive().sort(
				(a, b) => Math.hypot(a.pos.x, a.pos.y) - Math.hypot(b.pos.x, b.pos.y),
			);
			const A = as[0];
			const aWord = cw(A);
			const B = as.find((e) => e.id !== A.id && cw(e)[0] !== aWord[2]);
			if (!B || aWord.length < 3) return { error: "setup" };
			const aId = A.id;
			const bId = B.id;

			// type two chars of A
			g.sendKeys(aWord[0]);
			g.sendKeys(aWord[1]);
			let st = g.getState();
			const targetIsA = st.targetId === aId;
			const aTyped2 = st.enemies.find((e) => e.id === aId)?.typedCount;

			// switch to B via its initial — A must keep its progress, not reset
			g.sendKeys(cw(B)[0]);
			st = g.getState();
			const targetIsB = st.targetId === bId;
			const aDuringB = st.enemies.find((e) => e.id === aId)?.typedCount;

			// finish B (loop in case it absorbs and reassigns)
			let kg = 0;
			while (
				g.getState().enemies.some((e) => e.id === bId && e.alive) &&
				kg++ < 30
			) {
				const b = g.getState().enemies.find((e) => e.id === bId && e.alive);
				if (!b) break;
				const w = cw(b);
				for (let i = b.typedCount; i < w.length; i++) g.sendKeys(w[i]);
			}
			const killsAfterB = g.getState().kills;
			const aAfterB = g
				.getState()
				.enemies.find((e) => e.id === aId)?.typedCount;

			// return to A — its saved progress resumes rather than restarting
			let ag = 0;
			while (
				g.getState().enemies.some((e) => e.id === aId && e.alive) &&
				ag++ < 30
			) {
				const a = g.getState().enemies.find((e) => e.id === aId && e.alive);
				if (!a) break;
				const w = cw(a);
				for (let i = a.typedCount; i < w.length; i++) g.sendKeys(w[i]);
			}
			return {
				targetIsA,
				aTyped2,
				targetIsB,
				aDuringB,
				killsAfterB,
				aAfterB,
				finalKills: g.getState().kills,
			};
		});

		expect(r.error).toBeUndefined();
		expect(r.targetIsA).toBe(true);
		expect(r.aTyped2).toBe(2);
		expect(r.targetIsB).toBe(true);
		expect(r.aDuringB).toBe(2); // switching away preserved A's progress
		expect(r.killsAfterB).toBe(1);
		expect(r.aAfterB).toBe(2); // still preserved after B died
		expect(r.finalKills).toBe(2);
	});

	test("backspace releases the target without a miss, keeping progress", async ({
		page,
	}) => {
		await page.goto("/game?seed=42&testMode=1");
		await page.waitForFunction(() => window.__game !== undefined);
		await page.evaluate(() => window.__game?.stepTicks(181));

		const r = await page.evaluate(() => {
			const g = window.__game;
			if (!g) return { error: "no game" };
			const cw = (e: { words: string[]; wordIndex: number }) =>
				e.words[e.wordIndex];
			let guard = 0;
			while (
				g.getState().enemies.filter((e) => e.alive).length < 1 &&
				guard++ < 400
			)
				g.stepTicks(20);
			const A = g.getState().enemies.find((e) => e.alive);
			if (!A) return { error: "no enemy" };
			const missBefore = g.getState().misses;
			g.sendKeys(cw(A)[0]); // acquire A
			let st = g.getState();
			const targetSet = st.targetId === A.id;
			const typedBefore = st.enemies.find((e) => e.id === A.id)?.typedCount;

			g.sendBackspace(); // release
			st = g.getState();
			return {
				targetSet,
				typedBefore,
				targetAfter: st.targetId,
				typedAfter: st.enemies.find((e) => e.id === A.id)?.typedCount,
				missBefore,
				missAfter: st.misses,
			};
		});

		expect(r.error).toBeUndefined();
		expect(r.targetSet).toBe(true);
		expect(r.typedBefore).toBe(1);
		expect(r.targetAfter).toBeNull(); // lock released
		expect(r.typedAfter).toBe(1); // progress kept
		expect(r.missAfter).toBe(r.missBefore); // release is never a miss
	});

	test("perk draft: clearing wave 1 offers 3 perks; picking one applies it and resumes", async ({
		page,
	}) => {
		await page.goto("/game?seed=42&testMode=1");
		await page.waitForFunction(() => window.__game !== undefined);

		// drive the whole wave-1 clear (5 enemies, staggered spawns) in-page via
		// free-flow typing, looping until the sim enters the frozen "perk-choice"
		// phase — mirrors the free-flow/backspace tests' in-page drive pattern.
		const r = await page.evaluate(() => {
			const g = window.__game;
			if (!g) return { error: "no game" };
			const cw = (e: { words: string[]; wordIndex: number }) =>
				e.words[e.wordIndex];
			let guard = 0;
			while (g.getState().wavePhase !== "perk-choice" && guard++ < 2000) {
				const s = g.getState();
				const alive = s.enemies.filter((e) => e.alive);
				if (alive.length === 0) {
					g.stepTicks(20);
					continue;
				}
				const target = alive.find((e) => e.id === s.targetId) ?? alive[0];
				const word = cw(target);
				g.sendKeys(word[target.typedCount] ?? word[0]);
			}
			const st = g.getState();
			return { wavePhase: st.wavePhase, offer: st.perkOffer, wave: st.wave };
		});

		expect(r.error).toBeUndefined();
		expect(r.wavePhase).toBe("perk-choice");
		expect(r.offer).toHaveLength(3);
		expect(r.wave).toBe(1);

		await expect(page.getByTestId("perk-overlay")).toBeVisible();
		await expect(page.getByTestId("perk-card-0")).toBeVisible();
		await expect(page.getByTestId("perk-card-1")).toBeVisible();
		await expect(page.getByTestId("perk-card-2")).toBeVisible();

		await page.evaluate(() => window.__game?.sendPerk(0));

		await expect(page.getByTestId("perk-overlay")).toBeHidden();
		const after = await page.evaluate(() => window.__game?.getState());
		expect(after?.perks.length).toBe(1);
		expect(after?.wavePhase).toBe("intermission");
	});

	test("boss bar: wave 5 boss shows a life bar with one segment per max hp", async ({
		page,
	}) => {
		await page.goto("/game?seed=42&testMode=1");
		await page.waitForFunction(() => window.__game !== undefined);

		// drive waves 1-4 clear (auto-picking perk card 0 between waves) until the
		// wave-5 boss spawns — seed-hunted (see PR description) so this lands well
		// under the wall-clock budget (~190 keystrokes, no full boss-sentence typing
		// required since we only need the boss ALIVE, not defeated).
		const r = await page.evaluate(() => {
			const g = window.__game;
			if (!g) return { error: "no game" };
			const cw = (e: { words: string[]; wordIndex: number }) =>
				e.words[e.wordIndex];
			const hasBoss = (s: ReturnType<typeof g.getState>) =>
				s.wave >= 5 &&
				s.enemies.some((e) => e.alive && e.archetypeId.startsWith("boss-"));
			let guard = 0;
			while (!hasBoss(g.getState()) && guard++ < 4000) {
				const s = g.getState();
				if (s.wavePhase === "perk-choice") {
					g.sendPerk(0);
					continue;
				}
				const alive = s.enemies.filter((e) => e.alive);
				if (alive.length === 0) {
					g.stepTicks(20);
					continue;
				}
				const target = alive.find((e) => e.id === s.targetId) ?? alive[0];
				const word = cw(target);
				g.sendKeys(word[target.typedCount] ?? word[0]);
			}
			const s = g.getState();
			const boss = s.enemies.find(
				(e) => e.alive && e.archetypeId.startsWith("boss-"),
			);
			return { wave: s.wave, bossMaxHp: boss?.maxHp, bossHp: boss?.hp };
		});

		expect(r.error).toBeUndefined();
		expect(r.wave).toBe(5);
		expect(r.bossMaxHp).toBeGreaterThan(0);

		const bossBar = page.getByTestId("boss-bar");
		await expect(bossBar).toBeVisible();
		// segments live in the bar's second child row (first is the name/hp text)
		const segments = bossBar.locator("> div").nth(1).locator("> div");
		await expect(segments).toHaveCount(r.bossMaxHp as number);
	});

	test("frenzy wave: wave 4 swarm shows the FRENZY HUD chip", async ({
		page,
	}) => {
		// seed=1 seed-hunted to roll a wave-4 swarm (see round-7 design doc §2) —
		// only waves 1-3 (21 enemies) need clearing since the chip appears the
		// instant wave 4 goes active, before any swarm enemy is typed.
		await page.goto("/game?seed=1&testMode=1");
		await page.waitForFunction(() => window.__game !== undefined);

		const r = await page.evaluate(() => {
			const g = window.__game;
			if (!g) return { error: "no game" };
			const cw = (e: { words: string[]; wordIndex: number }) =>
				e.words[e.wordIndex];
			let guard = 0;
			while (
				!(g.getState().wave >= 4 && g.getState().wavePhase === "active") &&
				guard++ < 4000
			) {
				const s = g.getState();
				if (s.wavePhase === "perk-choice") {
					g.sendPerk(0);
					continue;
				}
				const alive = s.enemies.filter((e) => e.alive);
				if (alive.length === 0) {
					g.stepTicks(20);
					continue;
				}
				const target = alive.find((e) => e.id === s.targetId) ?? alive[0];
				const word = cw(target);
				g.sendKeys(word[target.typedCount] ?? word[0]);
			}
			const s = g.getState();
			return { wave: s.wave, waveKind: s.waveKind, wavePhase: s.wavePhase };
		});

		expect(r.error).toBeUndefined();
		expect(r.wave).toBe(4);
		expect(r.waveKind).toBe("swarm");
		expect(r.wavePhase).toBe("active");

		await expect(page.getByTestId("wave-frenzy")).toBeVisible();
		await expect(page.getByTestId("game-wave")).toBeHidden();
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
