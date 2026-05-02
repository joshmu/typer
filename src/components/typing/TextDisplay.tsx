import { createEffect, createSignal, For } from "solid-js";
import { getWordTop } from "@/lib/core/layout/layout-cache";
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

	// Scroll when the active word moves past the first visible line.
	// Pure lookup against the layout cache — no DOM read per keystroke.
	createEffect(() => {
		const wordTop = getWordTop(layoutCache(), props.currentWordIndex);
		if (wordTop === null) return;
		if (wordTop > lineHeight + translateY()) {
			setTranslateY(wordTop - lineHeight);
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
