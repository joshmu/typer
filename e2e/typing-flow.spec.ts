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

test("Tab from a focused link on results moves on as usual", async ({
	page,
}) => {
	await page.goto("/");
	await page.getByRole("button", { name: "custom" }).click();
	await page.getByTestId("text-input").fill("ab");
	await page.getByTestId("start-button").click();
	await page.getByTestId("typing-test").focus();
	await page.keyboard.type("ab");
	const redo = page.getByRole("button", { name: "Redo" });
	await expect(redo).toBeVisible({ timeout: 5000 });

	await page.getByRole("link", { name: "Home" }).focus();
	await page.keyboard.press("Tab");
	await expect(redo).not.toBeFocused();
	await expect(page.getByRole("link", { name: "Game" })).toBeFocused();
});

test("time sub-options stay reachable once time text loads", async ({
	page,
}) => {
	await page.clock.install();
	await page.goto("/");
	await page.getByRole("button", { name: "time" }).click();
	await expect(page.getByTestId("typing-test")).toBeVisible();

	await page.getByRole("button", { name: "60s" }).click();
	const typingTest = page.getByTestId("typing-test");
	await expect(typingTest).toBeFocused();
	await page.keyboard.type("t");

	await page.clock.fastForward(59_000);
	await expect(page.getByText("Redo")).toBeHidden();

	await page.clock.fastForward(1_000);
	await expect(page.getByText("Redo")).toBeVisible({ timeout: 5000 });
	await expect(page.getByText("1:00", { exact: true })).toBeVisible();
});

test("words-count sub-options stay reachable once words text loads", async ({
	page,
}) => {
	await page.goto("/");
	await page.getByRole("button", { name: "words" }).click();
	await expect(page.getByTestId("typing-test")).toBeVisible();

	await page.getByRole("button", { name: "10", exact: true }).click();
	await expect(page.getByTestId("typing-test")).toBeFocused();
	await expect(
		page.locator('[data-testid="text-display"] > div > span'),
	).toHaveCount(10);
});

test("quote-length sub-options stay reachable once quote text loads", async ({
	page,
}) => {
	await page.goto("/");
	await page.getByRole("button", { name: "quote" }).click();
	await expect(page.getByTestId("typing-test")).toBeVisible();

	const short = page.getByRole("button", { name: "short" });
	await short.click();
	await expect(short).toHaveClass(/text-primary/);
	await expect(page.getByTestId("typing-test")).toBeFocused();
});

test("the mode selector hides once typing starts", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("button", { name: "words" }).click();
	const selector = page.getByTestId("mode-selector");
	await expect(selector).toBeVisible();
	await expect(selector).not.toHaveClass(/pointer-events-none/);

	await page.getByTestId("typing-test").focus();
	await page.keyboard.type("x");
	await expect(selector).toHaveClass(/opacity-0/);
	await expect(selector).toHaveClass(/pointer-events-none/);
});
