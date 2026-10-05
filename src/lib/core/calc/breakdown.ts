import type { TypingState } from "../types";

export interface CharBreakdown {
	correct: number;
	incorrect: number;
	/** Characters the user skipped: left untyped in text behind the cursor. */
	missed: number;
	extra: number;
	/** Characters the test covered: the four counts above, not untyped text ahead. */
	total: number;
}

type Cursor = Pick<
	TypingState,
	"words" | "currentWordIndex" | "currentCharIndex"
>;

export function calculateCharBreakdown({
	words,
	currentWordIndex,
	currentCharIndex,
}: Cursor): CharBreakdown {
	let correct = 0;
	let incorrect = 0;
	let missed = 0;
	let extra = 0;

	words.forEach((word, w) => {
		word.characters.forEach((char, c) => {
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
				case "missed":
					missed++;
					break;
				case "pending": {
					const passed =
						w < currentWordIndex ||
						(w === currentWordIndex && c < currentCharIndex);
					if (passed) missed++;
					break;
				}
			}
		});
	});

	return {
		correct,
		incorrect,
		missed,
		extra,
		total: correct + incorrect + missed + extra,
	};
}
