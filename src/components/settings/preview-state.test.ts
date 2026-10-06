import { describe, expect, it } from "vitest";
import {
	charClasses,
	createPreviewState,
	type PreviewState,
	pressKey,
} from "./preview-state";

function typeAll(state: PreviewState, keys: string[]): PreviewState {
	return keys.reduce((s, k) => pressKey(s, k).state, state);
}

describe("preview state", () => {
	it("starts empty with the cursor at zero", () => {
		const s = createPreviewState("ab");
		expect(s.cursor).toBe(0);
		expect(charClasses(s)).toEqual(["text-text-pending", "text-text-pending"]);
	});

	it("marks a right key correct and a wrong key wrong", () => {
		let s = createPreviewState("abc");
		const first = pressKey(s, "a");
		expect(first.ok).toBe(true);
		s = first.state;
		const second = pressKey(s, "x");
		expect(second.ok).toBe(false);
		expect(charClasses(second.state)).toEqual([
			"text-correct",
			"text-error char-wrong",
			"text-text-pending",
		]);
	});

	it("keeps the mistake history once a char is retyped correctly", () => {
		const s = typeAll(createPreviewState("abc"), ["a", "x", "Backspace", "b"]);
		expect(charClasses(s)).toEqual([
			"text-correct",
			"text-correct char-corrected",
			"text-text-pending",
		]);
	});

	it("backspace at the start does nothing", () => {
		const s = pressKey(createPreviewState("ab"), "Backspace");
		expect(s.state.cursor).toBe(0);
		expect(s.ok).toBeNull();
	});

	it("ignores keys that are not one character", () => {
		const s = pressKey(createPreviewState("ab"), "Shift");
		expect(s.state.cursor).toBe(0);
		expect(s.ok).toBeNull();
	});

	it("starts over after the last char", () => {
		const s = typeAll(createPreviewState("ab"), ["a", "b"]);
		expect(s.cursor).toBe(0);
		expect(charClasses(s)).toEqual(["text-text-pending", "text-text-pending"]);
	});

	it("can be built from a replayed key sequence", () => {
		const s = createPreviewState("the", ["t", "x", "Backspace", "h"]);
		expect(s.cursor).toBe(2);
		expect(charClasses(s)).toEqual([
			"text-correct",
			"text-correct char-corrected",
			"text-text-pending",
		]);
	});
});
