import { expect, type Page, test } from "@playwright/test";
import { keySoundRecord, SOUND_TAG, watchKeySound } from "./fixtures/key-sound";

async function startCustomTest(page: Page) {
	await page.goto("/");
	await page.getByRole("button", { name: "custom" }).click();
	await page.getByTestId("text-input").fill("the quick brown fox");
	await page.getByTestId("start-button").click();
	const typingTest = page.getByTestId("typing-test");
	await expect(typingTest).toBeVisible();
	await typingTest.focus();
}

test("key sound off creates no audio context", async ({ page }) => {
	await watchKeySound(page, false);
	await startCustomTest(page);
	await page.keyboard.type("the q");

	expect(await keySoundRecord(page)).toMatchObject({ contexts: 0, clicks: [] });
});

test.describe("key sound on", { tag: SOUND_TAG }, () => {
	test("plays one click per key, a different one for a wrong key", async ({
		page,
	}) => {
		await watchKeySound(page, true);
		await startCustomTest(page);
		// warmed on mount, before the first key
		await expect
			.poll(async () => (await keySoundRecord(page)).contexts)
			.toBe(1);

		await page.keyboard.type("tx");
		await page.keyboard.press("Backspace");
		await page.keyboard.type("h");

		const { contexts, states, clicks } = await keySoundRecord(page);
		expect(contexts).toBe(1);
		expect(states).toEqual(["running"]);
		expect(clicks).toHaveLength(4);
		const [ok, wrong, back, okAgain] = clicks;
		expect(wrong).not.toBe(ok);
		expect(back).toBe(ok);
		expect(okAgain).toBe(ok);
	});

	test("stop on error word: the key that resets the word clicks as correct", async ({
		page,
	}) => {
		await watchKeySound(page, true, { stopOnError: "word" });
		await startCustomTest(page);

		await page.keyboard.type("txe ");

		const { clicks } = await keySoundRecord(page);
		expect(clicks).toHaveLength(4);
		const [ok, wrong, okAfter, reset] = clicks;
		expect(wrong).not.toBe(ok);
		expect(okAfter).toBe(ok);
		expect(reset).toBe(ok);
	});

	test("backspace at the very start plays nothing", async ({ page }) => {
		await watchKeySound(page, true);
		await startCustomTest(page);

		await page.keyboard.press("Backspace");
		await page.keyboard.type("t");

		expect((await keySoundRecord(page)).clicks).toHaveLength(1);
	});
});
