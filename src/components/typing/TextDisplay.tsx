import { createEffect, createSignal, For } from "solid-js";
import { getWordTop } from "@/lib/core/layout/layout-cache";
import { lineScrollOffset } from "@/lib/core/layout/line-scroll";
import type { WordState } from "@/lib/core/types";
import { typingFontSize } from "@/lib/preferences";
import { usePreferences } from "@/lib/preferences-context";
import Caret from "./Caret";
import { pulseClass } from "./pulse-class";
import { domMeasurer, useLayoutCache } from "./use-layout-cache";
import Word from "./Word";

/** Imperative feedback the typing test triggers from its key handler. */
export interface TextDisplayHandle {
	/** Flash the caret and shake the word that took a wrong keystroke. */
	miss: (wordIndex: number) => void;
}

interface TextDisplayProps {
	words: WordState[];
	currentWordIndex: number;
	currentCharIndex: number;
	handle?: (handle: TextDisplayHandle) => void;
}

export default function TextDisplay(props: TextDisplayProps) {
	let containerRef: HTMLDivElement | undefined;
	let innerRef: HTMLDivElement | undefined;
	const [prefs] = usePreferences();
	const [translateY, setTranslateY] = createSignal(0);
	const lineHeight = () => typingFontSize(prefs.fontSize) * 2;
	const visibleLines = 3;

	// Words are only ever appended, so an index-keyed array stays valid.
	const wordEls: HTMLElement[] = [];
	let caretEl: HTMLElement | undefined;
	const reducedMotion =
		typeof window === "undefined"
			? null
			: window.matchMedia("(prefers-reduced-motion: reduce)");
	props.handle?.({
		miss: (wordIndex) => {
			pulseClass(caretEl, "caret-miss", "caret-miss");
			if (!reducedMotion?.matches) {
				pulseClass(wordEls[wordIndex], "word-miss", "word-shake");
			}
		},
	});

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
					ref={(el) => {
						caretEl = el;
					}}
				/>
				<For each={props.words}>
					{(word, index) => (
						<Word
							ref={(el) => {
								wordEls[index()] = el;
							}}
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
