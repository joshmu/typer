import type { CharacterState } from "../types";

export interface CharBreakdown {
	correct: number;
	incorrect: number;
	missed: number;
	extra: number;
	total: number;
}

export function calculateCharBreakdown(chars: CharacterState[]): CharBreakdown {
	let correct = 0;
	let incorrect = 0;
	let missed = 0;
	let extra = 0;

	for (const char of chars) {
		switch (char.status) {
			case "correct":
				correct++;
				break;
			case "incorrect":
				incorrect++;
				break;
			case "extra":
				extra++;
				break;
			case "pending":
			case "missed":
				missed++;
				break;
		}
	}

	return { correct, incorrect, missed, extra, total: chars.length };
}
