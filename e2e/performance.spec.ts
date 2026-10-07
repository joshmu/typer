import type { Page } from "@playwright/test";
import { keySoundRecord, SOUND_TAG, watchKeySound } from "./fixtures/key-sound";
import { expect, test } from "./fixtures/se-stub";

declare global {
	interface Window {
		__keyDurations?: number[];
		__programLinks?: number;
	}
}

const KEYSTROKE_BUDGET_MS = 16;
const KEYSTROKES = 200;
const GAME_KEYS = 40;

async function expectKeystrokesWithinBudget(page: Page, label: string) {
	await page.goto("/");

	// Pick custom mode and seed with a long text so we exercise the same hot
	// path as a real session.
	await page.getByRole("button", { name: "custom" }).click();
	const longText =
		"the quick brown fox jumps over the lazy dog and runs along the river bank to a quiet field beyond the old wooden gate ".repeat(
			3,
		);
	await page.getByTestId("text-input").fill(longText.trim());
	await page.getByTestId("start-button").click();

	const typingTest = page.getByTestId("typing-test");
	await expect(typingTest).toBeVisible();
	await typingTest.focus();

	// Install capture/bubble timers around keydown so we can measure how long
	// the handler chain takes per event. This includes Solid's setState path
	// and any imperative DOM updates done synchronously inside the handler.
	await page.evaluate(() => {
		window.__keyDurations = [];
		const starts = new WeakMap<KeyboardEvent, number>();
		document.addEventListener(
			"keydown",
			(e) => {
				starts.set(e, performance.now());
			},
			true,
		);
		document.addEventListener(
			"keydown",
			(e) => {
				const start = starts.get(e);
				if (start !== undefined) {
					window.__keyDurations?.push(performance.now() - start);
				}
			},
			false,
		);
	});

	for (let i = 0; i < KEYSTROKES; i++) {
		const ch = longText[i % longText.length];
		await page.keyboard.press(ch === " " ? "Space" : ch);
	}

	const durations = await page.evaluate(() => window.__keyDurations ?? []);
	expect(durations.length).toBeGreaterThanOrEqual(KEYSTROKES);

	const sorted = [...durations].sort((a, b) => a - b);
	const p95 = sorted[Math.floor(sorted.length * 0.95)];
	const p99 = sorted[Math.floor(sorted.length * 0.99)];
	const max = sorted[sorted.length - 1];

	console.log(
		`${label} keystroke latency — p95: ${p95.toFixed(2)}ms, p99: ${p99.toFixed(2)}ms, max: ${max.toFixed(2)}ms`,
	);

	expect(
		p95,
		`p95 keystroke handler time should be under ${KEYSTROKE_BUDGET_MS}ms`,
	).toBeLessThan(KEYSTROKE_BUDGET_MS);
	expect(
		durations[0],
		`the first keystroke should be under ${KEYSTROKE_BUDGET_MS}ms`,
	).toBeLessThan(KEYSTROKE_BUDGET_MS);
}

test("keydown handler stays within the 16ms frame budget at p95", async ({
	page,
}) => {
	await expectKeystrokesWithinBudget(page, "sound off");
});

test("keydown handler with key sound on stays within the 16ms frame budget at p95", {
	tag: SOUND_TAG,
}, async ({ page }) => {
	await watchKeySound(page, true);
	await expectKeystrokesWithinBudget(page, "sound on");

	const { states, clicks } = await keySoundRecord(page);
	expect(states).toEqual(["running"]);
	expect(clicks).toHaveLength(KEYSTROKES);
});

test("game keystroke round-trip stays within the 16ms frame budget at p95", async ({
	page,
}) => {
	await page.goto("/game?seed=42&testMode=1");
	await page.waitForFunction(() => window.__game !== undefined);

	// step past the opening intermission so live enemies exist to type against;
	// each sendKeys drives a full sim step + Babylon render in test mode, so this
	// measures the real per-keystroke round-trip a player experiences
	await page.evaluate(() => window.__game?.stepTicks(200));

	const durations = await page.evaluate((count) => {
		const letters = "etaoinshrdlucmfwypvbgkjqxz";
		const d: number[] = [];
		for (let i = 0; i < count; i++) {
			const t0 = performance.now();
			window.__game?.sendKeys(letters[i % letters.length]);
			d.push(performance.now() - t0);
		}
		return d;
	}, GAME_KEYS);
	expect(durations.length).toBe(GAME_KEYS);

	const sorted = [...durations].sort((a, b) => a - b);
	const p95 = sorted[Math.floor(sorted.length * 0.95)];
	const max = sorted[sorted.length - 1];

	console.log(
		`game keystroke latency — p95: ${p95.toFixed(2)}ms, max: ${max.toFixed(2)}ms`,
	);

	expect(
		p95,
		`p95 game keystroke round-trip should be under ${KEYSTROKE_BUDGET_MS}ms`,
	).toBeLessThan(KEYSTROKE_BUDGET_MS);
});

// A shader built mid-keystroke stalls that key for as long as the GPU takes
// to compile it (over half a second on software GL). Once the arena reports
// ready, the first lock, shot and kill must reuse shaders it already has.
// Counts WebGL program links from outside the app, so it doesn't hang on timing.
test("the first shot and kill build no shaders once the arena is ready", async ({
	page,
}) => {
	await page.addInitScript(() => {
		window.__programLinks = 0;
		for (const proto of [
			WebGLRenderingContext.prototype,
			WebGL2RenderingContext.prototype,
		]) {
			const link = proto.linkProgram;
			proto.linkProgram = function (
				this: WebGLRenderingContext,
				program: WebGLProgram,
			) {
				window.__programLinks = (window.__programLinks ?? 0) + 1;
				return link.call(this, program);
			};
		}
	});
	await page.goto("/game?seed=42&testMode=1");
	await page.waitForFunction(() => window.__game !== undefined);
	await page.evaluate(() => window.__game?.stepTicks(200));
	await page.waitForFunction(() => window.__game?.renderReady() === true);
	const linked = await page.evaluate(() => window.__programLinks ?? 0);
	expect(linked).toBeGreaterThan(0);

	const run = await page.evaluate((count) => {
		const letters = "etaoinshrdlucmfwypvbgkjqxz";
		let shots = 0;
		for (let i = 0; i < count; i++) {
			const before = window.__game?.getState().targetId ?? null;
			window.__game?.sendKeys(letters[i % letters.length]);
			if (before === null && window.__game?.getState().targetId != null) {
				shots++;
			}
		}
		// let the last kill's impact land and its burst play out
		window.__game?.stepTicks(30);
		return { shots, kills: window.__game?.getState().kills ?? 0 };
	}, GAME_KEYS);
	expect(run.shots).toBeGreaterThan(0);
	expect(run.kills).toBeGreaterThan(0);
	expect(await page.evaluate(() => window.__programLinks)).toBe(linked);
});
