import { describe, expect, it, vi } from "vitest";
import type { Feed, TestMode, TypingState } from "../types";
import { createTypingSession, initTypingState } from "./typing-session";

function setup(text: string, mode: TestMode, feed?: Feed) {
	const onComplete = vi.fn<(state: TypingState) => void>();
	const state = initTypingState(text, mode, "off");
	const session = createTypingSession({ state, feed, onComplete });
	const type = (keys: string, from = 1000) => {
		[...keys].forEach((k, i) => {
			session.key(k, from + i);
		});
	};
	return { state, session, onComplete, type };
}

function listFeed(words: string[]): Feed {
	let i = 0;
	return {
		next(count) {
			const out = words.slice(i, i + count);
			i += out.length;
			return out.join(" ");
		},
		get exhausted() {
			return i >= words.length;
		},
	};
}

describe("initTypingState", () => {
	it("normalizes the text and activates the first word", () => {
		const state = initTypingState("  ab   cd ", { type: "custom" }, "word");
		expect(state.text).toBe("ab cd");
		expect(state.words).toHaveLength(2);
		expect(state.words[0].isActive).toBe(true);
		expect(state.config.stopOnError).toBe("word");
	});
});

describe("time mode", () => {
	const time30: TestMode = { type: "time", seconds: 30 };

	it("has no deadline until the first key", () => {
		const { session } = setup("ab cd", time30);
		expect(session.deadline()).toBeNull();
		session.key("a", 5000);
		expect(session.deadline()).toBe(35_000);
	});

	it("ends at the time limit with no further keystroke", () => {
		const { state, session, onComplete } = setup("ab cd ef", time30);
		session.key("a", 5000);

		session.tick(34_999);
		expect(onComplete).not.toHaveBeenCalled();

		session.tick(35_000);
		expect(onComplete).toHaveBeenCalledTimes(1);
		expect(state.endTime).toBe(35_000);
		expect(session.complete).toBe(true);
	});

	it("ends at the deadline, not the late clock reading", () => {
		const { state, session } = setup("ab cd ef", time30);
		session.key("a", 5000);
		session.tick(40_000);
		expect(state.endTime).toBe(35_000);
	});

	it("drops a keystroke that arrives after the deadline", () => {
		const { state, session, onComplete } = setup("ab cd ef", time30);
		session.key("a", 5000);
		session.key("b", 36_000);
		expect(state.words[0].characters[1].status).toBe("pending");
		expect(onComplete).toHaveBeenCalledTimes(1);
	});

	it("refills past the initial words and ends exactly at the deadline", () => {
		const feed = listFeed(Array.from({ length: 40 }, () => "ab"));
		const { state, session, onComplete, type } = setup("ab cd", time30, feed);
		type("ab cd ");
		type("ab ".repeat(10), 2000);
		expect(state.currentWordIndex).toBe(12);
		expect(onComplete).not.toHaveBeenCalled();

		session.tick(31_000);
		expect(onComplete).toHaveBeenCalledTimes(1);
		expect(state.endTime).toBe(31_000);
	});

	it("waits for its limit when the words run out", () => {
		const { state, session, onComplete, type } = setup("ab cd", time30);
		type("ab cd");
		expect(onComplete).not.toHaveBeenCalled();
		expect(state.endTime).toBeNull();

		session.tick(31_000);
		expect(onComplete).toHaveBeenCalledTimes(1);
		expect(state.endTime).toBe(31_000);
	});

	it("does not end before the first key", () => {
		const { session, onComplete } = setup("ab cd", time30);
		session.tick(1_000_000);
		expect(onComplete).not.toHaveBeenCalled();
	});
});

describe("last word end rule", () => {
	it.each<TestMode>([
		{ type: "words", count: 10 },
		{ type: "quote", length: "short" },
		{ type: "custom" },
	])("$type mode ends when the last word is typed", (mode) => {
		const { state, session, onComplete, type } = setup("ab cd", mode);
		type("ab c");
		expect(onComplete).not.toHaveBeenCalled();
		type("d", 2000);
		expect(onComplete).toHaveBeenCalledTimes(1);
		expect(onComplete).toHaveBeenCalledWith(state);
		expect(state.endTime).toBe(2000);
		expect(session.complete).toBe(true);
	});
});

describe("Esc end rule", () => {
	it.each<TestMode>([
		{ type: "zen" },
		{ type: "book", bookId: "b", chapterIndex: 0 },
	])("$type mode ends on Esc once started", (mode) => {
		const { state, session, onComplete, type } = setup("ab cd ef", mode);
		session.key("Escape", 900);
		expect(onComplete).not.toHaveBeenCalled();

		type("ab");
		session.key("Escape", 3000);
		expect(onComplete).toHaveBeenCalledTimes(1);
		expect(state.endTime).toBe(3000);
	});

	it("ignores Esc in modes with a fixed end", () => {
		const { session, onComplete, type } = setup("ab cd", { type: "custom" });
		type("ab");
		session.key("Escape", 3000);
		expect(onComplete).not.toHaveBeenCalled();
	});
});

describe("continuous refill", () => {
	it("refills from the feed as the cursor nears the end", () => {
		const feed = listFeed(["gh", "ij", "kl"]);
		const { state, type } = setup("ab cd", { type: "zen" }, feed);
		type("a");
		expect(state.words).toHaveLength(5);
		expect(state.text).toBe("ab cd gh ij kl");
	});

	it("ends book mode when the feed is exhausted and the last word is typed", () => {
		const book: TestMode = { type: "book", bookId: "b", chapterIndex: 0 };
		const feed = listFeed(["ef"]);
		const { state, session, onComplete, type } = setup("ab cd", book, feed);
		type("ab cd ");
		expect(onComplete).not.toHaveBeenCalled();
		type("ef", 2000);
		expect(feed.exhausted).toBe(true);
		expect(onComplete).toHaveBeenCalledTimes(1);
		expect(state.endTime).toBe(2001);
		expect(session.complete).toBe(true);
	});

	it("does not refill modes with a fixed end", () => {
		const feed = listFeed(["gh"]);
		const { state, type } = setup("ab cd", { type: "custom" }, feed);
		type("a");
		expect(state.words).toHaveLength(2);
	});
});

describe("onComplete fires exactly once", () => {
	it("ignores every input after completion", () => {
		const { session, onComplete, type } = setup("ab", { type: "zen" });
		type("a");
		session.key("Escape", 2000);
		session.key("Escape", 2001);
		session.key("b", 2002);
		session.tick(1_000_000);
		expect(onComplete).toHaveBeenCalledTimes(1);
	});
});

describe("write port", () => {
	it("writes each key through the injected writer once", () => {
		const state = initTypingState("ab", { type: "custom" }, "off");
		const frozen = structuredClone(state);
		const writes: string[] = [];
		const session = createTypingSession({
			state,
			write: (mutate) => {
				writes.push("write");
				mutate(state);
			},
		});
		expect(state).toEqual(frozen);
		session.key("a", 1000);
		session.key("b", 1001);
		expect(writes).toEqual(["write", "write"]);
		expect(state.endTime).toBe(1001);
	});
});
