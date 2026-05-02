/**
 * Pure layout cache for the typing surface.
 *
 * Caret positions and word tops are pre-computed once per layout change
 * (mount, resize, words append) and read from this cache during keystrokes.
 * Keeping the cache pure (zero DOM/framework deps) means the lookup logic is
 * fully unit-testable and the engine layer's purity rule is preserved — the
 * DOM measurement that populates the cache lives in the component layer.
 */

export interface CharLayout {
	left: number;
	top: number;
	width: number;
}

export interface WordLayout {
	top: number;
	/** Left position immediately after the last char (last.left + last.width). */
	endLeft: number;
	chars: CharLayout[];
}

export interface LayoutCache {
	words: WordLayout[];
}

export interface CaretPosition {
	left: number;
	top: number;
	width: number;
}

export function emptyCache(): LayoutCache {
	return { words: [] };
}

export function getCharLayout(
	cache: LayoutCache,
	wordIdx: number,
	charIdx: number,
): CharLayout | null {
	return cache.words[wordIdx]?.chars[charIdx] ?? null;
}

/**
 * Position of the caret given a (wordIdx, charIdx) cursor.
 * When charIdx is past the last char, the caret sits flush against the
 * right edge of the last char (matching the prior offset-based behaviour).
 */
export function getCaretPosition(
	cache: LayoutCache,
	wordIdx: number,
	charIdx: number,
): CaretPosition | null {
	const word = cache.words[wordIdx];
	if (!word) return null;

	const char = word.chars[charIdx];
	if (char) {
		return { left: char.left, top: char.top, width: char.width };
	}

	const last = word.chars[word.chars.length - 1];
	if (!last) return null;
	return { left: word.endLeft, top: last.top, width: last.width };
}

export function getWordTop(cache: LayoutCache, wordIdx: number): number | null {
	return cache.words[wordIdx]?.top ?? null;
}
