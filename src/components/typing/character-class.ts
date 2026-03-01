/**
 * Returns the CSS class for a character based on its status and mistake history.
 *
 * Correct characters that had prior mistakes retain an error tint.
 * Incorrect characters show a progressive error scale based on mistake count.
 */
export function characterClass(status: string, mistakeCount: number): string {
	switch (status) {
		case "correct":
			if (mistakeCount === 0) return "text-correct";
			if (mistakeCount <= 2) return "text-correct-tint";
			return "text-correct-tint-heavy";
		case "incorrect":
			if (mistakeCount <= 1) return "text-error-1";
			if (mistakeCount === 2) return "text-error-2";
			if (mistakeCount <= 4) return "text-error-3";
			return "text-error";
		case "extra":
			return "text-error-extra";
		case "missed":
			return "text-error opacity-50";
		default:
			return "text-text-sub";
	}
}
