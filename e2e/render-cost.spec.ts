import type { Page } from "@playwright/test";
import { keySoundRecord, SOUND_TAG, watchKeySound } from "./fixtures/key-sound";
import { expect, test } from "./fixtures/se-stub";

// Counts Word remounts and layout re-measures per keystroke from the outside:
// a MutationObserver on the word container and wrappers around the layout
// read APIs (offset getters, client rects). No app code is instrumented.

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

const WORD_SPANS = '[data-testid="text-display"] > div > span';

// Loads a custom test with the passage and waits for the mount measure pass.
async function startTest(page: Page) {
	// One layout measure pass reads many rects synchronously; count each burst
	// of reads inside the text display once.
	await page.addInitScript(() => {
		window.__layoutMeasures = 0;
		let inPass = false;
		const note = (el: Element) => {
			if (inPass || !el.closest('[data-testid="text-display"]')) return;
			inPass = true;
			window.__layoutMeasures = (window.__layoutMeasures ?? 0) + 1;
			queueMicrotask(() => {
				inPass = false;
			});
		};
		for (const prop of [
			"offsetTop",
			"offsetLeft",
			"offsetWidth",
			"offsetHeight",
		]) {
			const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop);
			const get = desc?.get;
			if (!desc || !get) continue;
			Object.defineProperty(HTMLElement.prototype, prop, {
				...desc,
				get(this: HTMLElement) {
					note(this);
					return get.call(this);
				},
			});
		}
		for (const method of ["getBoundingClientRect", "getClientRects"] as const) {
			const original = Element.prototype[method] as (this: Element) => unknown;
			Object.defineProperty(Element.prototype, method, {
				configurable: true,
				writable: true,
				value(this: Element) {
					note(this);
					return original.call(this);
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
	await expect(page.locator(WORD_SPANS)).toHaveCount(PASSAGE_WORDS);
	await page.waitForFunction(() => (window.__layoutMeasures ?? 0) > 0);
}

// Deltas are sampled at each keydown (capture), so each slot holds the work
// caused by the previous keystroke; flushRenderCost closes the last slot.
async function installRecorder(page: Page) {
	await page.evaluate(() => {
		const words = document.querySelector('[data-testid="text-display"] > div');
		if (!words) throw new Error("word container not found");
		const cost = { remounts: [] as number[], measures: [] as number[] };
		window.__renderCost = cost;
		let remounts = 0;
		let lastMeasures = window.__layoutMeasures ?? 0;
		const count = (records: MutationRecord[]) => {
			for (const r of records) {
				for (const n of r.addedNodes) {
					if (n instanceof HTMLElement && n.tagName === "SPAN") remounts++;
				}
			}
		};
		const observer = new MutationObserver(count);
		observer.observe(words, { childList: true });
		const sample = () => {
			count(observer.takeRecords());
			const measures = window.__layoutMeasures ?? 0;
			cost.remounts.push(remounts);
			cost.measures.push(measures - lastMeasures);
			remounts = 0;
			lastMeasures = measures;
		};
		document.addEventListener("keydown", sample, true);
		window.__flushRenderCost = sample;
	});
}

async function flushRenderCost(page: Page): Promise<RenderCost> {
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

async function measureTyping(page: Page): Promise<RenderCost> {
	await startTest(page);
	await installRecorder(page);
	await page.keyboard.type(passage.slice(0, KEYSTROKES));
	return flushRenderCost(page);
}

function report(label: string, perKey: number[]) {
	const total = perKey.reduce((a, b) => a + b, 0);
	const max = Math.max(...perKey);
	console.log(
		`${label}: ${(total / perKey.length).toFixed(2)}/keystroke (max ${max}, total ${total} over ${perKey.length} keystrokes, ${PASSAGE_WORDS}-word passage)`,
	);
	return max;
}

// Proves each counter sees what it should, so the budgets below cannot pass
// on a broken harness.
test("the render-cost harness counts measures and remounts", async ({
	page,
}) => {
	await startTest(page);
	await expect(page.locator(`${WORD_SPANS} > span`).first()).toBeVisible();
	await installRecorder(page);

	const probe = await page.evaluate(async () => {
		const words = document.querySelector('[data-testid="text-display"] > div');
		const word = words?.querySelector("span");
		if (!words || !word) throw new Error("word container not found");
		window.__flushRenderCost?.();
		word.getBoundingClientRect();
		await Promise.resolve();
		word.getClientRects();
		await Promise.resolve();
		void word.offsetHeight;
		const added = document.createElement("span");
		words.append(added);
		added.remove();
		window.__flushRenderCost?.();
		const cost = window.__renderCost;
		if (!cost) throw new Error("recorder not installed");
		const result = {
			measures: cost.measures.at(-1),
			remounts: cost.remounts.at(-1),
		};
		cost.measures.length = 0;
		cost.remounts.length = 0;
		return result;
	});
	expect(probe).toEqual({ measures: 3, remounts: 1 });

	await page.keyboard.type(passage.slice(0, KEYSTROKES));
	const { remountsPerKey, measuresPerKey } = await flushRenderCost(page);
	expect(remountsPerKey).toHaveLength(KEYSTROKES);
	expect(measuresPerKey).toHaveLength(KEYSTROKES);
});

for (const sound of [false, true]) {
	const on = sound ? " with key sound on" : "";
	const details = sound ? { tag: SOUND_TAG } : {};

	test(
		`a keystroke remounts at most one Word${on}`,
		details,
		async ({ page }) => {
			if (sound) await watchKeySound(page, true);
			const { remountsPerKey } = await measureTyping(page);
			expect(remountsPerKey).toHaveLength(KEYSTROKES);
			const max = report(`Word remounts${on}`, remountsPerKey);
			expect(max).toBeLessThanOrEqual(1);
			if (sound) {
				expect((await keySoundRecord(page)).clicks).toHaveLength(KEYSTROKES);
			}
		},
	);

	test(
		`a cursor-only keystroke does not re-measure layout${on}`,
		details,
		async ({ page }) => {
			if (sound) await watchKeySound(page, true);
			const { measuresPerKey } = await measureTyping(page);
			expect(measuresPerKey).toHaveLength(KEYSTROKES);
			const max = report(`Layout re-measures${on}`, measuresPerKey);
			expect(max).toBe(0);
			if (sound) {
				expect((await keySoundRecord(page)).clicks).toHaveLength(KEYSTROKES);
			}
		},
	);
}

// Every third character key is wrong, so each of those keystrokes also
// flashes the caret and shakes the word. That feedback must stay class
// toggles: no extra remounts and no layout reads.
function missHeavyKeys(): string[] {
	return Array.from(passage.slice(0, KEYSTROKES), (ch, i) => {
		if (i % 3 !== 1 || ch === " ") return ch;
		return ch === "z" ? "x" : "z";
	});
}

for (const stopOnError of ["off", "letter", "word"] as const) {
	test(`miss-heavy typing (stop on error: ${stopOnError}) stays cursor-only`, async ({
		page,
	}) => {
		await page.addInitScript((value) => {
			localStorage.setItem(
				"typer-preferences",
				JSON.stringify({ stopOnError: value }),
			);
		}, stopOnError);
		await startTest(page);
		await installRecorder(page);
		for (const key of missHeavyKeys()) {
			await page.keyboard.press(key === " " ? "Space" : key);
		}
		const { remountsPerKey, measuresPerKey } = await flushRenderCost(page);
		expect(measuresPerKey).toHaveLength(KEYSTROKES);
		expect(
			report(`Word remounts, misses, ${stopOnError}`, remountsPerKey),
		).toBe(0);
		expect(
			report(`Layout re-measures, misses, ${stopOnError}`, measuresPerKey),
		).toBe(0);
	});
}
