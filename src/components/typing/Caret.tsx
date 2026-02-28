import { createEffect, createSignal } from "solid-js";
import type { WordState } from "@/lib/core/types";

interface CaretProps {
	words: WordState[];
	currentWordIndex: number;
	currentCharIndex: number;
	containerRef: () => HTMLDivElement | undefined;
}

export default function Caret(props: CaretProps) {
	const [left, setLeft] = createSignal(0);
	const [top, setTop] = createSignal(0);
	const [isIdle, setIsIdle] = createSignal(true);
	let idleTimer: ReturnType<typeof setTimeout> | undefined;

	createEffect(() => {
		// Access reactive deps
		const wordIdx = props.currentWordIndex;
		const charIdx = props.currentCharIndex;
		const container = props.containerRef();

		if (!container) return;

		// Reset idle state
		setIsIdle(false);
		if (idleTimer) clearTimeout(idleTimer);
		idleTimer = setTimeout(() => setIsIdle(true), 1500);

		// Find the target character element
		const wordElements = container.children;
		// Skip first child (caret itself) to get word elements
		const wordEl = wordElements[wordIdx + 1] as HTMLElement | undefined;
		if (!wordEl) return;

		const charEls = wordEl.children;
		const charEl = charEls[charIdx] as HTMLElement | undefined;

		if (charEl) {
			// Position at the start of the current character
			setLeft(charEl.offsetLeft);
			setTop(charEl.offsetTop);
		} else if (charEls.length > 0) {
			// Past last char — position at end of last char
			const lastChar = charEls[charEls.length - 1] as HTMLElement;
			setLeft(lastChar.offsetLeft + lastChar.offsetWidth);
			setTop(lastChar.offsetTop);
		}
	});

	return (
		<div
			class="absolute w-[2px] bg-caret transition-[left,top] duration-[80ms] will-change-transform"
			classList={{
				"animate-blink": isIdle(),
			}}
			style={{
				left: `${left()}px`,
				top: `${top()}px`,
				height: "1.5em",
			}}
			data-testid="caret"
		/>
	);
}
