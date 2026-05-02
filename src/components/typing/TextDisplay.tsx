import { createEffect, createSignal, For } from "solid-js";
import type { WordState } from "@/lib/core/types";
import Caret from "./Caret";
import { useLayoutCache } from "./use-layout-cache";
import Word from "./Word";

interface TextDisplayProps {
	words: WordState[];
	currentWordIndex: number;
	currentCharIndex: number;
}

export default function TextDisplay(props: TextDisplayProps) {
	let containerRef: HTMLDivElement | undefined;
	let innerRef: HTMLDivElement | undefined;
	const [translateY, setTranslateY] = createSignal(0);
	const lineHeight = 48;
	const visibleLines = 3;

	const layoutCache = useLayoutCache(
		() => innerRef,
		() => props.words,
	);

	createEffect(() => {
		if (!innerRef) return;
		const activeWordIndex = props.currentWordIndex;
		const wordElements = innerRef.children;
		if (activeWordIndex >= wordElements.length) return;

		const activeEl = wordElements[activeWordIndex] as HTMLElement;
		const containerTop = innerRef.offsetTop;
		const wordTop = activeEl.offsetTop - containerTop;

		// Scroll when active word goes past the first visible line
		const scrollThreshold = lineHeight;
		if (wordTop > scrollThreshold + translateY()) {
			const newTranslate = wordTop - scrollThreshold;
			setTranslateY(newTranslate);
		}
	});

	return (
		<div
			ref={containerRef}
			class="relative overflow-hidden select-none text-2xl leading-[48px] font-mono"
			style={{ height: `${lineHeight * visibleLines}px` }}
			data-testid="text-display"
		>
			<div
				ref={innerRef}
				class="relative transition-transform duration-150 ease-out"
				style={{ transform: `translateY(-${translateY()}px)` }}
			>
				<Caret
					layoutCache={layoutCache}
					currentWordIndex={props.currentWordIndex}
					currentCharIndex={props.currentCharIndex}
				/>
				<For each={props.words}>
					{(word, index) => (
						<Word
							word={word}
							isActive={index() === props.currentWordIndex}
							activeCharIndex={
								index() === props.currentWordIndex ? props.currentCharIndex : -1
							}
						/>
					)}
				</For>
			</div>
		</div>
	);
}
