import {
	type Accessor,
	createEffect,
	createSignal,
	onCleanup,
	onMount,
} from "solid-js";
import { emptyCache, type LayoutCache } from "@/lib/core/layout/layout-cache";
import type { WordState } from "@/lib/core/types";

/**
 * Strategy for turning a container DOM element into a LayoutCache snapshot.
 * Injected so the hook can be unit-tested without relying on jsdom's
 * incomplete offset support.
 */
export interface Measurer {
	measure: (container: HTMLElement) => LayoutCache;
}

/**
 * Default measurer that reads offsetLeft/offsetTop/offsetWidth from the
 * container's word and char spans. Runs once per layout change — never
 * during keystroke processing.
 */
export const domMeasurer: Measurer = {
	measure: (container) => {
		const wordEls = container.querySelectorAll<HTMLElement>(":scope > span");
		const words = Array.from(wordEls).map((wordEl) => {
			const charEls = wordEl.querySelectorAll<HTMLElement>(":scope > span");
			const chars = Array.from(charEls).map((c) => ({
				left: c.offsetLeft,
				top: c.offsetTop,
				width: c.offsetWidth,
			}));
			const top = chars[0]?.top ?? wordEl.offsetTop;
			const last = chars[chars.length - 1];
			const endLeft = last ? last.left + last.width : 0;
			return { top, endLeft, chars };
		});
		return { words };
	},
};

/**
 * Maintain a LayoutCache that re-measures the container only when the
 * layout could have changed: on mount, when the words array reference
 * changes (zen/book append, restart), and when the container resizes
 * (font change, window resize). Cursor-only updates do NOT re-measure.
 *
 * All measure calls are coalesced through a single requestAnimationFrame
 * so multiple triggers in the same frame produce a single read.
 */
export function useLayoutCache(
	containerRef: () => HTMLElement | undefined,
	wordsAccessor: () => WordState[],
	measurer: Measurer = domMeasurer,
): Accessor<LayoutCache> {
	const [cache, setCache] = createSignal<LayoutCache>(emptyCache());
	let rafId: number | null = null;
	let observer: ResizeObserver | null = null;

	const scheduleMeasure = () => {
		if (rafId !== null) return;
		rafId = requestAnimationFrame(() => {
			rafId = null;
			const container = containerRef();
			if (container) setCache(measurer.measure(container));
		});
	};

	onMount(() => {
		const container = containerRef();
		if (container && typeof ResizeObserver !== "undefined") {
			observer = new ResizeObserver(scheduleMeasure);
			observer.observe(container);
		}
	});

	createEffect(() => {
		wordsAccessor();
		scheduleMeasure();
	});

	onCleanup(() => {
		if (rafId !== null) cancelAnimationFrame(rafId);
		observer?.disconnect();
	});

	return cache;
}
