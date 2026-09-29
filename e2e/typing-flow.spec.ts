import { expect, test } from "@playwright/test";

test("full typing flow: paste text → type → see results", async ({ page }) => {
	await page.goto("/");

	// Step 1: Switch to custom mode and paste text
	await page.getByRole("button", { name: "custom" }).click();
	const textInput = page.getByTestId("text-input");
	await expect(textInput).toBeVisible();
	await textInput.fill("the quick brown fox");

	// Step 2: Click Start
	const startButton = page.getByTestId("start-button");
	await startButton.click();

	// Step 3: Verify typing area is visible
	const typingTest = page.getByTestId("typing-test");
	await expect(typingTest).toBeVisible();

	// Step 4: Type the text
	await typingTest.focus();
	const textToType = "the quick brown fox";
	for (const char of textToType) {
		await page.keyboard.press(char === " " ? "Space" : char);
		// Small delay to simulate real typing
		await page.waitForTimeout(30);
	}

	// Step 5: Verify results screen appears
	await expect(page.getByText("Redo")).toBeVisible({ timeout: 5000 });
	// Results screen shows WPM label and accuracy stat
	await expect(page.getByText("wpm", { exact: true })).toBeVisible();
	await expect(page.getByText("accuracy", { exact: true })).toBeVisible();
});

test("redo button restarts the flow", async ({ page }) => {
	await page.goto("/");

	// Switch to custom mode
	await page.getByRole("button", { name: "custom" }).click();
	const textInput = page.getByTestId("text-input");
	await textInput.fill("ab");
	await page.getByTestId("start-button").click();

	const typingTest = page.getByTestId("typing-test");
	await typingTest.focus();
	await page.keyboard.press("a");
	await page.keyboard.press("b");

	// Wait for results
	const redoButton = page.getByText("Redo");
	await expect(redoButton).toBeVisible({ timeout: 5000 });

	// Click redo — should go back to text input
	await redoButton.click();
	await expect(page.getByTestId("text-input")).toBeVisible();
});

test("Tab then Enter on results restarts wherever focus is", async ({
	page,
}) => {
	await page.goto("/");
	await page.getByRole("button", { name: "custom" }).click();
	await page.getByTestId("text-input").fill("ab");
	await page.getByTestId("start-button").click();

	const typingTest = page.getByTestId("typing-test");
	await typingTest.focus();
	await page.keyboard.type("ab");
	await expect(page.getByText("Redo")).toBeVisible({ timeout: 5000 });

	// Move the focus start point below the Redo button.
	await page.getByText("personal best").click();
	await page.keyboard.press("Tab");
	await page.keyboard.press("Enter");
	await expect(page.getByTestId("text-input")).toBeVisible();
});

test("time mode ends at its limit with no further keystroke", async ({
	page,
}) => {
	await page.clock.install();
	await page.goto("/");
	await page.getByRole("button", { name: "time" }).click();

	const typingTest = page.getByTestId("typing-test");
	await expect(typingTest).toBeVisible();
	await typingTest.focus();
	await page.keyboard.type("t");

	await page.clock.fastForward(29_000);
	await expect(page.getByText("Redo")).toBeHidden();

	await page.clock.fastForward(1_000);
	await expect(page.getByText("Redo")).toBeVisible({ timeout: 5000 });
	await expect(page.getByText("30s", { exact: true })).toBeVisible();
});
