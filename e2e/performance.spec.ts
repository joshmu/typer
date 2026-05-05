import { expect, test } from "@playwright/test";

declare global {
	interface Window {
		__keyDurations?: number[];
	}
}

const KEYSTROKE_BUDGET_MS = 16;
const KEYSTROKES = 200;

test("keydown handler stays within the 16ms frame budget at p95", async ({
	page,
}) => {
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
		`keystroke latency — p95: ${p95.toFixed(2)}ms, p99: ${p99.toFixed(2)}ms, max: ${max.toFixed(2)}ms`,
	);

	expect(
		p95,
		`p95 keystroke handler time should be under ${KEYSTROKE_BUDGET_MS}ms`,
	).toBeLessThan(KEYSTROKE_BUDGET_MS);
});
