import { createEffect, createSignal } from "solid-js";
import type { WordState } from "@/lib/core/types";

export type CaretStyle = "line" | "block" | "underline";

interface CaretProps {
	words: WordState[];
	currentWordIndex: number;
	currentCharIndex: number;
	containerRef: () => HTMLDivElement | undefined;
	style?: CaretStyle;
	smooth?: boolean;
}

export default function Caret(props: CaretProps) {
	const [left, setLeft] = createSignal(0);
	const [top, setTop] = createSignal(0);
	const [charWidth, setCharWidth] = createSignal(0);
	const [isIdle, setIsIdle] = createSignal(true);
	let idleTimer: ReturnType<typeof setTimeout> | undefined;

	const caretStyle = () => props.style ?? "line";
	const smooth = () => props.smooth ?? true;

	createEffect(() => {
		const wordIdx = props.currentWordIndex;
		const charIdx = props.currentCharIndex;
		const container = props.containerRef();

		if (!container) return;

		setIsIdle(false);
		if (idleTimer) clearTimeout(idleTimer);
		idleTimer = setTimeout(() => setIsIdle(true), 1500);

		const wordElements = container.children;
		const wordEl = wordElements[wordIdx + 1] as HTMLElement | undefined;
		if (!wordEl) return;

		const charEls = wordEl.children;
		const charEl = charEls[charIdx] as HTMLElement | undefined;

		if (charEl) {
			setLeft(charEl.offsetLeft);
			setTop(charEl.offsetTop);
			setCharWidth(charEl.offsetWidth);
		} else if (charEls.length > 0) {
			const lastChar = charEls[charEls.length - 1] as HTMLElement;
			setLeft(lastChar.offsetLeft + lastChar.offsetWidth);
			setTop(lastChar.offsetTop);
			setCharWidth(lastChar.offsetWidth);
		}
	});

	const styleProps = () => {
		const base = {
			left: `${left()}px`,
			top: `${top()}px`,
		};

		switch (caretStyle()) {
			case "block":
				return {
					...base,
					width: `${charWidth() || 10}px`,
					height: "1.5em",
				};
			case "underline":
				return {
					...base,
					top: `calc(${top()}px + 1.35em)`,
					width: `${charWidth() || 10}px`,
					height: "2px",
				};
			default: // line
				return {
					...base,
					width: "2px",
					height: "1.5em",
				};
		}
	};

	return (
		<div
			class="absolute bg-caret will-change-transform"
			classList={{
				"animate-blink": isIdle(),
				"transition-[left,top] duration-[80ms]": smooth(),
				"opacity-50": caretStyle() === "block",
			}}
			style={styleProps()}
			data-testid="caret"
		/>
	);
}
