/**
 * Returns the CSS class for a character based on its status and mistake history.
 *
 * Wrong characters are solid error. Correct characters that took a mistake
 * keep their colour and carry an error underline, so the history stays
 * visible without muddying the text.
 */
export function characterClass(status: string, mistakeCount: number): string {
	switch (status) {
		case "correct":
			return mistakeCount === 0
				? "text-correct"
				: "text-correct char-corrected";
		case "incorrect":
			return "text-error char-wrong";
		case "extra":
			return "text-error char-extra";
		case "missed":
			return "text-error opacity-50";
		default:
			return "text-text-pending";
	}
}
