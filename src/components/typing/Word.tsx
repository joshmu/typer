import { createEffect, For } from "solid-js";
import type { WordState } from "@/lib/core/types";

interface WordProps {
	word: WordState;
	isActive: boolean;
	activeCharIndex: number;
}

function characterClass(status: string, mistakeCount: number): string {
	switch (status) {
		case "correct":
			if (mistakeCount === 0) return "text-correct";
			if (mistakeCount <= 2) return "text-correct opacity-80";
			return "text-correct opacity-60";
		case "incorrect":
			if (mistakeCount <= 1) return "text-error-warn-1";
			if (mistakeCount === 2) return "text-error-warn-2";
			if (mistakeCount <= 4) return "text-error-warn-3";
			return "text-error";
		case "extra":
			return "text-error-extra";
		case "missed":
			return "text-error opacity-50";
		default:
			return "text-text-sub";
	}
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
