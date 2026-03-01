import type { CharacterState, WordState } from "../types";

/**
 * Normalize raw text for typing tests.
 * Collapses whitespace, trims, and optionally truncates at word boundary.
 */
export function normalizeText(text: string, maxLength?: number): string {
	let result = text.replace(/\s+/g, " ").trim();

	if (maxLength !== undefined && result.length > maxLength) {
		const truncated = result.slice(0, maxLength);
		// If we cut mid-word, find the last word boundary
		if (result[maxLength] !== " " && result[maxLength] !== undefined) {
			const lastSpace = truncated.lastIndexOf(" ");
			result = lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
		} else {
			result = truncated;
		}
	}

	return result;
}

/**
 * Split text into WordState array.
 * Non-last words include a trailing space character.
 */
export function textToWords(text: string): WordState[] {
	if (text === "") return [];

	const words = text.split(" ");
	return words.map((word, i) => {
		const isLast = i === words.length - 1;
		const wordText = isLast ? word : `${word} `;
		return {
			characters: textToCharacters(wordText),
			isActive: false,
		};
	});
}

/**
 * Convert text into a flat array of pending CharacterStates.
 */
export function textToCharacters(text: string): CharacterState[] {
	return [...text].map((ch) => ({
		expected: ch,
		typed: null,
		status: "pending" as const,
		timestamp: null,
		mistakeCount: 0,
	}));
}
