/**
 * Returns the CSS class for a character based on its status and mistake history.
 *
 * Incorrect characters always show full error color regardless of mistake count.
 * Correct characters that had prior mistakes show reduced opacity.
 */
export function characterClass(status: string, mistakeCount: number): string {
	switch (status) {
		case "correct":
			if (mistakeCount === 0) return "text-correct";
			if (mistakeCount <= 2) return "text-correct opacity-80";
			return "text-correct opacity-60";
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
