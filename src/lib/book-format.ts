/** Typing pace assumed for estimates when there is no history. */
export const DEFAULT_WPM = 40;

const NUMERAL = String.raw`(?:[IVXLCDM]+|\d+)`;
const SEPARATOR = String.raw`\s*[.:\u2013\u2014-]\s*`;
/** "Chapter I", "Ch. 2", "Chapter the First", "Chapter Two", optionally followed by a separator. */
const RESTATED_PREFIX = new RegExp(
	String.raw`^(?:chapter|ch\.?)\s+(?:the\s+)?[a-z\d]+(?:${SEPARATOR}|\s*$)`,
	"i",
);
/** "III. ", "5 — " (upper-case numerals only, so "Mid-Summer" survives) */
const NUMERAL_PREFIX = new RegExp(`^${NUMERAL}(?:${SEPARATOR}|\\s*$)`);

/** The chapter's own name, with any restated number removed. */
function chapterName(title: string): string {
	const name = title
		.trim()
		.replace(RESTATED_PREFIX, "")
		.replace(NUMERAL_PREFIX, "")
		.trim();
	return name === "Untitled Chapter" ? "" : name;
}

/**
 * The one chapter label shown everywhere: "Chapter 3", plus the chapter's
 * own name when it has one: "Chapter 3: The Return".
 */
export function chapterLabel(index: number, title?: string): string {
	const base = `Chapter ${index + 1}`;
	const name = chapterName(title ?? "");
	return name ? `${base}: ${name}` : base;
}

/**
 * How much of each chapter the committed position covers, 0 to 1.
 */
export function chapterFills(
	chapterWords: number[],
	chapterIndex: number,
	wordOffset: number,
): number[] {
	return chapterWords.map((words, i) => {
		if (i < chapterIndex) return 1;
		if (i > chapterIndex || words <= 0) return 0;
		return Math.min(1, Math.max(0, wordOffset / words));
	});
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

/**
 * Cover tones, all read from the active theme: its accents, a complement of
 * the primary hue, and its muted text colour for the occasional plain cloth.
 */
const TONES: [tone: string, chromaBoost: number][] = [
	["var(--primary)", 1.7],
	["var(--error)", 1.7],
	["var(--warning)", 1.7],
	["oklch(from var(--primary) l c calc(h + 180))", 1.4],
	["var(--text-sub)", 1],
];
const TONE_STRENGTHS = [24, 32, 40];

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
	// The boost undoes the greying a mix toward the background adds.
	const [tone, boost] = TONES[h % TONES.length];
	const strength =
		TONE_STRENGTHS[Math.floor(h / TONES.length) % TONE_STRENGTHS.length];
	return `oklch(from color-mix(in oklab, ${tone} ${strength}%, var(--bg-secondary)) l calc(c * ${boost}) h)`;
}
