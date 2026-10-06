import { characterClass } from "@/components/typing/character-class";

/** A tiny self-contained typing line for the settings preview. */
export interface PreviewState {
	readonly text: string;
	readonly typed: readonly (string | null)[];
	readonly mistakes: readonly number[];
	readonly cursor: number;
}

export interface KeyResult {
	state: PreviewState;
	/** True for a right key, false for a wrong one, null when nothing typed. */
	ok: boolean | null;
}

export function createPreviewState(
	text: string,
	replay: readonly string[] = [],
): PreviewState {
	const empty: PreviewState = {
		text,
		typed: Array(text.length).fill(null),
		mistakes: Array(text.length).fill(0),
		cursor: 0,
	};
	return replay.reduce((s, key) => pressKey(s, key).state, empty);
}

export function pressKey(state: PreviewState, key: string): KeyResult {
	if (key === "Backspace") {
		if (state.cursor === 0) return { state, ok: null };
		const at = state.cursor - 1;
		const typed = state.typed.slice();
		typed[at] = null;
		return { state: { ...state, typed, cursor: at }, ok: true };
	}
	if (key.length !== 1) return { state, ok: null };

	const at = state.cursor;
	const ok = key === state.text[at];
	if (at + 1 >= state.text.length) {
		return { state: createPreviewState(state.text), ok };
	}
	const typed = state.typed.slice();
	const mistakes = state.mistakes.slice();
	typed[at] = key;
	if (!ok) mistakes[at] += 1;
	return { state: { ...state, typed, mistakes, cursor: at + 1 }, ok };
}

/** The same classes the typing test uses, one per char of the text. */
export function charClasses(state: PreviewState): string[] {
	return Array.from(state.text, (expected, i) => {
		const typed = state.typed[i];
		if (i >= state.cursor || typed === null) {
			return characterClass("pending", 0);
		}
		return typed === expected
			? characterClass("correct", state.mistakes[i])
			: characterClass("incorrect", state.mistakes[i]);
	});
}
