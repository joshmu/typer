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
 * The book percent as shown: "<1%" once anything is typed, so a started
 * book never reads as untouched.
 */
export function formatBookPercent(
	percent: number,
	position?: { chapterIndex: number; wordOffset: number },
): string {
	const started =
		!!position && (position.chapterIndex > 0 || position.wordOffset > 0);
	return percent === 0 && started ? "<1%" : `${percent}%`;
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
 * the primary hue and a deep shade of the primary.
 */
const TONES: [tone: string, chromaBoost: number][] = [
	["var(--primary)", 1.6],
	["var(--error)", 1.6],
	["var(--warning)", 1.6],
	["oklch(from var(--primary) l c calc(h + 180))", 1.6],
	["oklch(from var(--primary) calc(l * 0.62) c h)", 1.4],
];
const TONE_STRENGTHS = [24, 32, 40];
/** The background at its own lightness with no hue, so a mix keeps the tone's hue. */
const NEUTRAL_BG = "oklch(from var(--bg-secondary) l 0 0)";
/** Enough colour that no cover reads as grey or mud. */
const MIN_CHROMA = 0.07;
const MAX_CHROMA = 0.2;

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
	// The boost wins back the chroma a mix toward the background loses.
	const [tone, boost] = TONES[h % TONES.length];
	const strength =
		TONE_STRENGTHS[Math.floor(h / TONES.length) % TONE_STRENGTHS.length];
	return `oklch(from color-mix(in oklab, ${tone} ${strength}%, ${NEUTRAL_BG}) l clamp(${MIN_CHROMA}, calc(c * ${boost}), ${MAX_CHROMA}) h)`;
}

const AGE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
	["day", 86_400_000],
	["hour", 3_600_000],
	["minute", 60_000],
];

/** How long ago a timestamp was, in words ("5 minutes ago", "yesterday"). */
export function formatAge(then: number, now = Date.now()): string {
	const elapsed = Math.max(0, now - then);
	const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
	for (const [unit, ms] of AGE_UNITS) {
		if (elapsed >= ms) return rtf.format(-Math.floor(elapsed / ms), unit);
	}
	return "just now";
}
