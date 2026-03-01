import { createEffect, For } from "solid-js";
import type { WordState } from "@/lib/core/types";
import { characterClass } from "./character-class";

interface WordProps {
	word: WordState;
	isActive: boolean;
	activeCharIndex: number;
}

export default function Word(props: WordProps) {
	let wordRef: HTMLSpanElement | undefined;

	// Imperative class updates for performance — avoid per-character reactivity
	createEffect(() => {
		if (!wordRef) return;
		const word = props.word;
		const chars = wordRef.children;
		for (let i = 0; i < word.characters.length && i < chars.length; i++) {
			(chars[i] as HTMLElement).className = characterClass(
				word.characters[i].status,
				word.characters[i].mistakeCount,
			);
		}
	});

	return (
		<span ref={wordRef} class="inline" data-word-active={props.isActive}>
			<For each={props.word.characters}>
				{(char) => (
					<span class={characterClass(char.status, char.mistakeCount)}>
						{char.expected}
					</span>
				)}
			</For>
		</span>
	);
}
