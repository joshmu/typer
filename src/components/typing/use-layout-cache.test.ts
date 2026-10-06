import { createRoot, createSignal } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WordState } from "@/lib/core/types";
import { createWordState } from "@/lib/core/types/test-fixtures";
import { domMeasurer, type Measurer, useLayoutCache } from "./use-layout-cache";

function trackingMeasurer() {
	let calls = 0;
	const measurer: Measurer = {
		measure: () => {
			calls++;
			return { words: [{ top: calls, endLeft: 0, chars: [] }] };
		},
	};
	return { measurer, getCalls: () => calls };
}

let resizeObserverCallback: ResizeObserverCallback | null = null;
let observeFn = vi.fn();
let disconnectFn = vi.fn();
let rafCallbacks: FrameRequestCallback[] = [];
let nextRafId = 1;

beforeEach(() => {
	resizeObserverCallback = null;
	observeFn = vi.fn();
	disconnectFn = vi.fn();
	rafCallbacks = [];
	nextRafId = 1;
	class MockResizeObserver {
		constructor(cb: ResizeObserverCallback) {
			resizeObserverCallback = cb;
		}
		observe = observeFn;
		unobserve = vi.fn();
		disconnect = disconnectFn;
	}
	vi.stubGlobal("ResizeObserver", MockResizeObserver);
	vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
		rafCallbacks.push(cb);
		return nextRafId++;
	});
	vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
	vi.unstubAllGlobals();
});

/** Drain pending rAF callbacks then yield to the microtask queue so any
 * triggered Solid effects can flush before the next assertion. */
const flush = async () => {
	await Promise.resolve();
	while (rafCallbacks.length > 0) {
		const cbs = rafCallbacks;
		rafCallbacks = [];
		for (const cb of cbs) cb(0);
		await Promise.resolve();
	}
};

describe("useLayoutCache", () => {
	it("measures on mount", async () => {
		await createRoot(async (dispose) => {
			const container = document.createElement("div");
			const { measurer, getCalls } = trackingMeasurer();
			const [words] = createSignal<WordState[]>([createWordState("hi")]);

			const cache = useLayoutCache(() => container, words, measurer);
			await flush();

			expect(getCalls()).toBeGreaterThanOrEqual(1);
			expect(cache().words.length).toBe(1);
			dispose();
		});
	});

	it("re-measures when the words signal reference changes", async () => {
		await createRoot(async (dispose) => {
			const container = document.createElement("div");
			const { measurer, getCalls } = trackingMeasurer();
			const [words, setWords] = createSignal<WordState[]>([
				createWordState("hi"),
			]);

			useLayoutCache(() => container, words, measurer);
			await flush();
			const initial = getCalls();

			setWords([createWordState("hello")]);
			await flush();
			expect(getCalls()).toBeGreaterThan(initial);
			dispose();
		});
	});

	it("re-measures when words are appended to a store in place", async () => {
		await createRoot(async (dispose) => {
			const container = document.createElement("div");
			const { measurer, getCalls } = trackingMeasurer();
			const [state, setState] = createStore({
				words: [createWordState("hi")],
			});

			useLayoutCache(
				() => container,
				() => state.words,
				measurer,
			);
			await flush();
			const initial = getCalls();

			setState(
				produce((s) => {
					s.words[0].characters[0].status = "correct";
				}),
			);
			await flush();
			expect(getCalls()).toBe(initial);

			setState(
				produce((s) => {
					s.words.push(createWordState("there"));
				}),
			);
			await flush();
			expect(getCalls()).toBe(initial + 1);
			dispose();
		});
	});

	it("does not re-measure when an unrelated signal changes (cursor-only ticks)", async () => {
		await createRoot(async (dispose) => {
			const container = document.createElement("div");
			const { measurer, getCalls } = trackingMeasurer();
			const [words] = createSignal<WordState[]>([createWordState("hi")]);
			const [_cursor, setCursor] = createSignal(0);

			useLayoutCache(() => container, words, measurer);
			await flush();
			const initial = getCalls();

			setCursor(42);
			await flush();
			expect(getCalls()).toBe(initial);
			dispose();
		});
	});

	it("re-measures when the layout key changes", async () => {
		await createRoot(async (dispose) => {
			const container = document.createElement("div");
			const { measurer, getCalls } = trackingMeasurer();
			const [words] = createSignal<WordState[]>([createWordState("hi")]);
			const [fontSize, setFontSize] = createSignal(16);

			useLayoutCache(() => container, words, measurer, fontSize);
			await flush();
			const initial = getCalls();

			setFontSize(20);
			await flush();
			expect(getCalls()).toBe(initial + 1);
			dispose();
		});
	});

	it("re-measures when the ResizeObserver callback fires", async () => {
		await createRoot(async (dispose) => {
			const container = document.createElement("div");
			const { measurer, getCalls } = trackingMeasurer();
			const [words] = createSignal<WordState[]>([createWordState("hi")]);

			useLayoutCache(() => container, words, measurer);
			await flush();
			expect(observeFn).toHaveBeenCalledWith(container);
			const initial = getCalls();

			resizeObserverCallback?.([], {} as ResizeObserver);
			await flush();
			expect(getCalls()).toBe(initial + 1);
			dispose();
		});
	});

	it("returns emptyCache when the container ref is undefined", async () => {
		await createRoot(async (dispose) => {
			const { measurer, getCalls } = trackingMeasurer();
			const [words] = createSignal<WordState[]>([createWordState("hi")]);

			const cache = useLayoutCache(() => undefined, words, measurer);
			await flush();

			expect(getCalls()).toBe(0);
			expect(cache().words).toEqual([]);
			dispose();
		});
	});

	it("disconnects the ResizeObserver on cleanup", async () => {
		let dispose: () => void = () => {};
		await createRoot(async (d) => {
			dispose = d;
			const container = document.createElement("div");
			const { measurer } = trackingMeasurer();
			const [words] = createSignal<WordState[]>([createWordState("hi")]);
			useLayoutCache(() => container, words, measurer);
			await flush();
		});
		dispose();
		expect(disconnectFn).toHaveBeenCalled();
	});
});

describe("domMeasurer", () => {
	it("returns empty words when the container has no spans", () => {
		const container = document.createElement("div");
		const cache = domMeasurer.measure(container);
		expect(cache.words).toEqual([]);
	});

	it("captures char layout from offset properties and computes endLeft", () => {
		const container = document.createElement("div");
		const word = document.createElement("span");
		const charA = document.createElement("span");
		const charB = document.createElement("span");
		Object.defineProperty(charA, "offsetLeft", { value: 0 });
		Object.defineProperty(charA, "offsetTop", { value: 10 });
		Object.defineProperty(charA, "offsetWidth", { value: 8 });
		Object.defineProperty(charB, "offsetLeft", { value: 8 });
		Object.defineProperty(charB, "offsetTop", { value: 10 });
		Object.defineProperty(charB, "offsetWidth", { value: 8 });
		word.appendChild(charA);
		word.appendChild(charB);
		container.appendChild(word);

		const cache = domMeasurer.measure(container);
		expect(cache.words.length).toBe(1);
		expect(cache.words[0].chars).toEqual([
			{ left: 0, top: 10, width: 8 },
			{ left: 8, top: 10, width: 8 },
		]);
		expect(cache.words[0].endLeft).toBe(16);
		expect(cache.words[0].top).toBe(10);
	});

	it("measures container-relative positions while a word is shaking", () => {
		// A shaking word is position: relative, which makes it the offsetParent
		// of its letters; the measurer must read positions as if it were not.
		const container = document.createElement("div");
		const before = document.createElement("span");
		const shaking = document.createElement("span");
		shaking.className = "inline word-miss";
		const char = document.createElement("span");
		const wordRelative = () => shaking.classList.contains("word-miss");
		Object.defineProperty(char, "offsetLeft", {
			get: () => (wordRelative() ? 30 : 89),
		});
		Object.defineProperty(char, "offsetTop", {
			get: () => (wordRelative() ? 0 : 9),
		});
		Object.defineProperty(char, "offsetWidth", { value: 15 });
		shaking.appendChild(char);
		container.append(before, shaking);

		const cache = domMeasurer.measure(container);
		expect(cache.words[1].chars).toEqual([{ left: 89, top: 9, width: 15 }]);
		expect(cache.words[1].top).toBe(9);
		expect(shaking.classList.contains("word-miss")).toBe(false);
	});

	it("ignores non-span children of the container (e.g. caret div)", () => {
		const container = document.createElement("div");
		const caret = document.createElement("div");
		const word = document.createElement("span");
		container.appendChild(caret);
		container.appendChild(word);

		const cache = domMeasurer.measure(container);
		expect(cache.words.length).toBe(1);
	});
});
