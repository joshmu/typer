import { expect, type Page, test } from "@playwright/test";

// Counts Word remounts and layout re-measures per keystroke from the outside:
// a MutationObserver on the word container and a wrapper around the offset
// getters the layout measurer reads. No app code is instrumented.

declare global {
	interface Window {
		__layoutMeasures?: number;
		__renderCost?: { remounts: number[]; measures: number[] };
		__flushRenderCost?: () => void;
	}
}

const PASSAGE_WORDS = 200;
const KEYSTROKES = 150;
const VOCAB =
	"the quick brown fox jumps over lazy dog while river bank quiet field beyond old wooden gate morning light falls across small town where people walk slowly home after long days work".split(
		" ",
	);
const passage = Array.from(
	{ length: PASSAGE_WORDS },
	(_, i) => VOCAB[(i * 7) % VOCAB.length],
).join(" ");

interface RenderCost {
	remountsPerKey: number[];
	measuresPerKey: number[];
}

async function measureTyping(page: Page): Promise<RenderCost> {
	// One layout measure pass reads many offsets synchronously; count each
	// burst of reads inside the text display once.
	await page.addInitScript(() => {
		window.__layoutMeasures = 0;
		let inPass = false;
		for (const prop of ["offsetTop", "offsetLeft", "offsetWidth"]) {
			const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop);
			const get = desc?.get;
			if (!desc || !get) continue;
			Object.defineProperty(HTMLElement.prototype, prop, {
				...desc,
				get(this: HTMLElement) {
					if (!inPass && this.closest('[data-testid="text-display"]')) {
						inPass = true;
						window.__layoutMeasures = (window.__layoutMeasures ?? 0) + 1;
						queueMicrotask(() => {
							inPass = false;
						});
					}
					return get.call(this);
				},
			});
		}
	});

	await page.goto("/");
	await page.getByRole("button", { name: "custom" }).click();
	await page.getByTestId("text-input").fill(passage);
	await page.getByTestId("start-button").click();

	const typingTest = page.getByTestId("typing-test");
	await expect(typingTest).toBeVisible();
	await typingTest.focus();
	await expect(
		page.locator('[data-testid="text-display"] > div > span'),
	).toHaveCount(PASSAGE_WORDS);
	await page.waitForFunction(() => (window.__layoutMeasures ?? 0) > 0);

	// Deltas are sampled at each keydown (capture), so each slot holds the
	// work caused by the previous keystroke; the last slot is flushed below.
	await page.evaluate(() => {
		const words = document.querySelector('[data-testid="text-display"] > div');
		if (!words) throw new Error("word container not found");
		const cost = { remounts: [] as number[], measures: [] as number[] };
		window.__renderCost = cost;
		let remounts = 0;
		let lastMeasures = window.__layoutMeasures ?? 0;
		new MutationObserver((records) => {
			for (const r of records) {
				for (const n of r.addedNodes) {
					if (n instanceof HTMLElement && n.tagName === "SPAN") {
						remounts++;
					}
				}
			}
		}).observe(words, { childList: true });
		const sample = () => {
			const measures = window.__layoutMeasures ?? 0;
			cost.remounts.push(remounts);
			cost.measures.push(measures - lastMeasures);
			remounts = 0;
			lastMeasures = measures;
		};
		document.addEventListener("keydown", sample, true);
		window.__flushRenderCost = sample;
	});

	await page.keyboard.type(passage.slice(0, KEYSTROKES));

	return page.evaluate(
		() =>
			new Promise<RenderCost>((resolve) => {
				requestAnimationFrame(() =>
					requestAnimationFrame(() => {
						window.__flushRenderCost?.();
						const cost = window.__renderCost ?? { remounts: [], measures: [] };
						// slot 0 precedes the first keystroke
						resolve({
							remountsPerKey: cost.remounts.slice(1),
							measuresPerKey: cost.measures.slice(1),
						});
					}),
				);
			}),
	);
}

function report(label: string, perKey: number[]) {
	const total = perKey.reduce((a, b) => a + b, 0);
	const max = Math.max(...perKey);
	console.log(
		`${label}: ${(total / perKey.length).toFixed(2)}/keystroke (max ${max}, total ${total} over ${perKey.length} keystrokes, ${PASSAGE_WORDS}-word passage)`,
	);
	return max;
}

// Known failure until #100 applies keystroke results path-scoped: today every
// keystroke replaces the words array, so every Word remounts.
test.fail("a keystroke remounts at most one Word", async ({ page }) => {
	const { remountsPerKey } = await measureTyping(page);
	expect(remountsPerKey).toHaveLength(KEYSTROKES);
	const max = report("Word remounts", remountsPerKey);
	expect(max).toBeLessThanOrEqual(1);
});

// Known failure until #100: the new words array reference triggers a re-measure.
test.fail(
	"a cursor-only keystroke does not re-measure layout",
	async ({ page }) => {
		const { measuresPerKey } = await measureTyping(page);
		expect(measuresPerKey).toHaveLength(KEYSTROKES);
		const max = report("Layout re-measures", measuresPerKey);
		expect(max).toBe(0);
	},
);
