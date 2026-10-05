import { describe, expect, it } from "vitest";
import { modeLabel } from "./mode-label";

describe("modeLabel", () => {
	it("names each mode with its option", () => {
		expect(modeLabel({ type: "time", seconds: 30 })).toBe("time 30s");
		expect(modeLabel({ type: "words", count: 25 })).toBe("words 25");
		expect(modeLabel({ type: "quote", length: "short" })).toBe("quote short");
		expect(modeLabel({ type: "zen" })).toBe("zen");
		expect(modeLabel({ type: "custom" })).toBe("custom");
		expect(modeLabel({ type: "book", bookId: "a/b", chapterIndex: 2 })).toBe(
			"book",
		);
	});
});
