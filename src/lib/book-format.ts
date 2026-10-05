/** Typing pace assumed for estimates when there is no history. */
export const DEFAULT_WPM = 40;

const NUMERAL_ONLY = /^(?:[ivxlcdm]+|\d+)\.?$/i;
const NUMBER_WORD_ONLY = /^(?:chapter|ch\.?)\b/i;

/**
 * The one chapter label shown everywhere: "Chapter 3", plus the chapter's
 * own name when it is more than a restated number.
 */
export function chapterLabel(index: number, title?: string): string {
	const base = `Chapter ${index + 1}`;
	const name = title?.trim() ?? "";
	if (
		!name ||
		name === "Untitled Chapter" ||
		NUMERAL_ONLY.test(name) ||
		NUMBER_WORD_ONLY.test(name)
	) {
		return base;
	}
	return `${base}: ${name}`;
}

export function typingMinutes(words: number, wpm: number): number {
	if (words <= 0 || wpm <= 0) return 0;
	return Math.ceil(words / wpm);
}

export function formatDuration(minutes: number): string {
	if (minutes <= 0) return "under a minute";
	if (minutes < 60) return `${minutes} min`;
	if (minutes >= 600) return `${Math.round(minutes / 60)} h`;
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export interface TypingPace {
	wpm: number;
	/** book: typed in this book; history: recent tests; default: no data. */
	source: "book" | "history" | "default";
}

export function pickTypingPace(
	bookWpm: number | undefined,
	historyWpm: number | null,
): TypingPace {
	if (bookWpm && bookWpm > 0) {
		return { wpm: Math.round(bookWpm), source: "book" };
	}
	if (historyWpm && historyWpm > 0) {
		return { wpm: Math.round(historyWpm), source: "history" };
	}
	return { wpm: DEFAULT_WPM, source: "default" };
}

const TONE_TOKENS = ["--primary", "--caret", "--warning", "--error", "--text"];
const TONE_STRENGTHS = [18, 26, 34];

function hash(text: string): number {
	let h = 2166136261;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

/**
 * A per-book cover colour for books without a cover image, mixed from theme
 * tokens so it follows the active theme.
 */
export function coverToneBackground(bookId: string): string {
	const h = hash(bookId);
	const token = TONE_TOKENS[h % TONE_TOKENS.length];
	const strength =
		TONE_STRENGTHS[Math.floor(h / TONE_TOKENS.length) % TONE_STRENGTHS.length];
	return `color-mix(in oklab, var(${token}) ${strength}%, var(--bg-secondary))`;
}
