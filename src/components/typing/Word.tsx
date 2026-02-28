import { createEffect, For } from "solid-js";
import type { WordState } from "@/lib/core/types";

interface WordProps {
	word: WordState;
	isActive: boolean;
	activeCharIndex: number;
}

function characterClass(status: string): string {
	switch (status) {
		case "correct":
			return "text-correct";
		case "incorrect":
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
			);
		}
	});

	return (
		<span ref={wordRef} class="inline" data-word-active={props.isActive}>
			<For each={props.word.characters}>
				{(char) => (
					<span class={characterClass(char.status)}>{char.expected}</span>
				)}
			</For>
		</span>
	);
}
