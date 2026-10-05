import { describe, expect, it } from "vitest";
import {
	chapterFills,
	chapterLabel,
	coverToneBackground,
	DEFAULT_WPM,
	formatAge,
	formatDuration,
	pickTypingPace,
	typingMinutes,
} from "./book-format";

describe("chapterLabel", () => {
	it("numbers the chapter from a zero-based index", () => {
		expect(chapterLabel(0)).toBe("Chapter 1");
		expect(chapterLabel(11, "")).toBe("Chapter 12");
	});

	it("drops titles that only repeat the number", () => {
		expect(chapterLabel(0, "I")).toBe("Chapter 1");
		expect(chapterLabel(3, "IV.")).toBe("Chapter 4");
		expect(chapterLabel(6, "7")).toBe("Chapter 7");
		expect(chapterLabel(0, "Chapter the First")).toBe("Chapter 1");
		expect(chapterLabel(0, "CHAPTER I")).toBe("Chapter 1");
		expect(chapterLabel(0, "Untitled Chapter")).toBe("Chapter 1");
	});

	it("keeps a real name that follows a restated number", () => {
		expect(chapterLabel(0, "Chapter I: The Arrival")).toBe(
			"Chapter 1: The Arrival",
		);
		expect(chapterLabel(1, "Chapter Two. The Storm")).toBe(
			"Chapter 2: The Storm",
		);
		expect(chapterLabel(2, "III. A Quiet Field")).toBe(
			"Chapter 3: A Quiet Field",
		);
		expect(chapterLabel(4, "5 — Homecoming")).toBe("Chapter 5: Homecoming");
	});

	it("keeps a name that only starts with the word chapter", () => {
		expect(chapterLabel(0, "Chapterhouse")).toBe("Chapter 1: Chapterhouse");
		expect(chapterLabel(0, "Mid-Summer")).toBe("Chapter 1: Mid-Summer");
	});

	it("keeps a real chapter name after the number", () => {
		expect(chapterLabel(2, "The Boy Who Lived")).toBe(
			"Chapter 3: The Boy Who Lived",
		);
	});
});

describe("typingMinutes", () => {
	it("rounds up to whole minutes", () => {
		expect(typingMinutes(100, 40)).toBe(3);
		expect(typingMinutes(80, 40)).toBe(2);
	});

	it("is zero with no words or no pace", () => {
		expect(typingMinutes(0, 40)).toBe(0);
		expect(typingMinutes(100, 0)).toBe(0);
	});
});

describe("formatDuration", () => {
	it("formats minutes and hours", () => {
		expect(formatDuration(1)).toBe("1 min");
		expect(formatDuration(45)).toBe("45 min");
		expect(formatDuration(60)).toBe("1 h");
		expect(formatDuration(65)).toBe("1 h 5 min");
		expect(formatDuration(9 * 60 + 40)).toBe("9 h 40 min");
	});

	it("drops minutes from long durations", () => {
		expect(formatDuration(16 * 60 + 56)).toBe("17 h");
	});

	it("reads under a minute for zero", () => {
		expect(formatDuration(0)).toBe("under a minute");
	});
});

describe("pickTypingPace", () => {
	it("prefers the pace typed in this book", () => {
		expect(pickTypingPace(62.4, 80)).toEqual({ wpm: 62, source: "book" });
	});

	it("falls back to the typing history average", () => {
		expect(pickTypingPace(0, 71.6)).toEqual({ wpm: 72, source: "history" });
		expect(pickTypingPace(undefined, 71.6)).toEqual({
			wpm: 72,
			source: "history",
		});
	});

	it("uses a default with no history", () => {
		expect(pickTypingPace(undefined, null)).toEqual({
			wpm: DEFAULT_WPM,
			source: "default",
		});
	});
});

describe("coverToneBackground", () => {
	it("is stable per book and built from theme tokens", () => {
		const a = coverToneBackground("author/book-a");
		expect(coverToneBackground("author/book-a")).toBe(a);
		expect(a).toContain("var(--bg-secondary)");
		expect(a).not.toMatch(/#[0-9a-f]{3,8}\b/i);
	});

	it("varies between books", () => {
		const tones = new Set(
			["a/1", "b/2", "c/3", "d/4", "e/5", "f/6"].map(coverToneBackground),
		);
		expect(tones.size).toBeGreaterThan(1);
	});
});

describe("chapterFills", () => {
	it("fills chapters before the committed one and part of the current", () => {
		expect(chapterFills([100, 50, 200], 1, 25)).toEqual([1, 0.5, 0]);
	});

	it("clamps an offset past the chapter end", () => {
		expect(chapterFills([10, 10], 0, 40)).toEqual([1, 0]);
	});

	it("treats an empty chapter before the cursor as read", () => {
		expect(chapterFills([0, 10], 1, 0)).toEqual([1, 0]);
	});
});

describe("formatAge", () => {
	const now = 1_000_000_000_000;
	const ago = (ms: number) => formatAge(now - ms, now);

	it("says just now under a minute", () => {
		expect(ago(30_000)).toBe("just now");
	});

	it("uses the largest whole unit", () => {
		expect(ago(60_000)).toBe("1 minute ago");
		expect(ago(5 * 60_000)).toBe("5 minutes ago");
		expect(ago(3 * 3_600_000)).toBe("3 hours ago");
		expect(ago(24 * 3_600_000)).toBe("yesterday");
		expect(ago(4 * 86_400_000)).toBe("4 days ago");
	});
});
