import type { TestMode } from "@/lib/core/types";

type ModeType = TestMode["type"];

/** Each mode with its default sub-option. */
export const MODE_DEFAULTS = {
	time: { type: "time", seconds: 30 },
	words: { type: "words", count: 25 },
	quote: { type: "quote", length: "medium" },
	zen: { type: "zen" },
	custom: { type: "custom" },
	book: { type: "book", bookId: "", chapterIndex: 0 },
} as const satisfies { [K in ModeType]: Extract<TestMode, { type: K }> };

/** A first visit lands on a time 30 test. */
export const DEFAULT_MODE: TestMode = MODE_DEFAULTS.time;

const SECONDS = [15, 30, 60, 120] as const;
const COUNTS = [10, 25, 50, 100] as const;
const LENGTHS = ["short", "medium", "long"] as const;

function oneOf<T>(options: readonly T[], value: unknown, fallback: T): T {
	return options.includes(value as T) ? (value as T) : fallback;
}

/**
 * A stored mode read back as a valid TestMode. An unknown mode becomes the
 * default; a missing or invalid sub-option becomes that mode's default.
 */
export function sanitizeMode(raw: unknown): TestMode {
	if (typeof raw !== "object" || raw === null) return { ...DEFAULT_MODE };
	const m = raw as Record<string, unknown>;
	switch (m.type) {
		case "time":
			return {
				type: "time",
				seconds: oneOf(SECONDS, m.seconds, MODE_DEFAULTS.time.seconds),
			};
		case "words":
			return {
				type: "words",
				count: oneOf(COUNTS, m.count, MODE_DEFAULTS.words.count),
			};
		case "quote":
			return {
				type: "quote",
				length: oneOf(LENGTHS, m.length, MODE_DEFAULTS.quote.length),
			};
		case "zen":
			return { type: "zen" };
		case "custom":
			return { type: "custom" };
		case "book":
			return {
				type: "book",
				bookId: typeof m.bookId === "string" ? m.bookId : "",
				chapterIndex:
					Number.isInteger(m.chapterIndex) && (m.chapterIndex as number) >= 0
						? (m.chapterIndex as number)
						: 0,
			};
		default:
			return { ...DEFAULT_MODE };
	}
}

/**
 * The mode a visit to "/" opens in: the last mode, except custom, whose text
 * is not kept. Book mode still needs a resumable book, or it falls back too.
 */
export function landingMode(raw: unknown): TestMode {
	const mode = sanitizeMode(raw);
	return mode.type === "custom" ? { ...DEFAULT_MODE } : mode;
}
