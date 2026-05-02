import { describe, expect, it } from "vitest";
import {
	emptyCache,
	getCaretPosition,
	getCharLayout,
	getWordTop,
	type LayoutCache,
} from "./layout-cache";

const sampleCache: LayoutCache = {
	containerTop: 100,
	words: [
		{
			top: 0,
			endLeft: 30,
			chars: [
				{ left: 0, top: 0, width: 10 },
				{ left: 10, top: 0, width: 10 },
				{ left: 20, top: 0, width: 10 },
			],
		},
		{
			top: 48,
			endLeft: 50,
			chars: [
				{ left: 30, top: 48, width: 10 },
				{ left: 40, top: 48, width: 10 },
			],
		},
	],
};

describe("emptyCache", () => {
	it("returns a cache with no words and zero containerTop", () => {
		const c = emptyCache();
		expect(c.words).toEqual([]);
		expect(c.containerTop).toBe(0);
	});
});

describe("getCharLayout", () => {
	it("returns the char layout for valid indices", () => {
		expect(getCharLayout(sampleCache, 1, 0)).toEqual({
			left: 30,
			top: 48,
			width: 10,
		});
	});

	it("returns null when the word index is out of bounds", () => {
		expect(getCharLayout(sampleCache, 99, 0)).toBeNull();
	});

	it("returns null when the char index is out of bounds", () => {
		expect(getCharLayout(sampleCache, 0, 99)).toBeNull();
	});

	it("returns null on an empty cache", () => {
		expect(getCharLayout(emptyCache(), 0, 0)).toBeNull();
	});
});

describe("getCaretPosition", () => {
	it("returns the position of the char under the caret", () => {
		expect(getCaretPosition(sampleCache, 0, 1)).toEqual({
			left: 10,
			top: 0,
			width: 10,
		});
	});

	it("returns position past the last char when charIdx equals word length", () => {
		// word 0 has 3 chars, endLeft = 30, last char top = 0, width = 10
		expect(getCaretPosition(sampleCache, 0, 3)).toEqual({
			left: 30,
			top: 0,
			width: 10,
		});
	});

	it("returns position past the last char when charIdx is beyond word length", () => {
		expect(getCaretPosition(sampleCache, 0, 99)).toEqual({
			left: 30,
			top: 0,
			width: 10,
		});
	});

	it("uses the correct word's last-char top when wrapping past end", () => {
		// word 1 lives on line 2 (top: 48); past-end position must use that top
		expect(getCaretPosition(sampleCache, 1, 2)).toEqual({
			left: 50,
			top: 48,
			width: 10,
		});
	});

	it("returns null when the word does not exist", () => {
		expect(getCaretPosition(sampleCache, 99, 0)).toBeNull();
	});

	it("returns null when the word has no chars", () => {
		const cache: LayoutCache = {
			containerTop: 0,
			words: [{ top: 0, endLeft: 0, chars: [] }],
		};
		expect(getCaretPosition(cache, 0, 0)).toBeNull();
	});

	it("returns null on an empty cache", () => {
		expect(getCaretPosition(emptyCache(), 0, 0)).toBeNull();
	});
});

describe("getWordTop", () => {
	it("returns the top of a valid word", () => {
		expect(getWordTop(sampleCache, 1)).toBe(48);
	});

	it("returns null when the word does not exist", () => {
		expect(getWordTop(sampleCache, 99)).toBeNull();
	});

	it("returns null on an empty cache", () => {
		expect(getWordTop(emptyCache(), 0)).toBeNull();
	});
});
