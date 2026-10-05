import { createEffect, createSignal, For } from "solid-js";
import { getWordTop } from "@/lib/core/layout/layout-cache";
import { lineScrollOffset } from "@/lib/core/layout/line-scroll";
import type { WordState } from "@/lib/core/types";
import { typingFontSize } from "@/lib/preferences";
import { usePreferences } from "@/lib/preferences-context";
import Caret from "./Caret";
import { domMeasurer, useLayoutCache } from "./use-layout-cache";
import Word from "./Word";

interface TextDisplayProps {
	words: WordState[];
	currentWordIndex: number;
	currentCharIndex: number;
}

export default function TextDisplay(props: TextDisplayProps) {
	let containerRef: HTMLDivElement | undefined;
	let innerRef: HTMLDivElement | undefined;
	const [prefs] = usePreferences();
	const [translateY, setTranslateY] = createSignal(0);
	const lineHeight = () => typingFontSize(prefs.fontSize) * 2;
	const visibleLines = 3;

	const layoutCache = useLayoutCache(
		() => innerRef,
		() => props.words,
		domMeasurer,
		() => prefs.fontSize,
	);

	// Read wordTop from the cache, not offsetTop — the keystroke hot path
	// must not force a layout recalc.
	createEffect(() => {
		const cache = layoutCache();
		const wordTop = getWordTop(cache, props.currentWordIndex);
		const firstTop = getWordTop(cache, 0);
		if (wordTop === null || firstTop === null) return;
		setTranslateY(
			lineScrollOffset(wordTop, firstTop, lineHeight(), translateY()),
		);
	});

	return (
		<div
			ref={containerRef}
			class="relative overflow-hidden select-none font-mono"
			style={{
				"font-size": "var(--typing-font-size)",
				"line-height": `${lineHeight()}px`,
				height: `${lineHeight() * visibleLines}px`,
			}}
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
					style={prefs.caretStyle}
					smooth={prefs.smoothCaret}
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
