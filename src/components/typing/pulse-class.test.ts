import { describe, expect, it } from "vitest";
import { pulseClass } from "./pulse-class";

function animationEvent(type: string, animationName: string): Event {
	const e = new Event(type, { bubbles: true });
	Object.defineProperty(e, "animationName", { value: animationName });
	return e;
}

describe("pulseClass", () => {
	it("adds the class and removes it when its animation ends", () => {
		const el = document.createElement("span");
		pulseClass(el, "word-miss", "word-shake");
		expect(el.classList.contains("word-miss")).toBe(true);

		el.dispatchEvent(animationEvent("animationend", "word-shake"));
		expect(el.classList.contains("word-miss")).toBe(false);
	});

	it("also clears the class when the animation is cancelled", () => {
		const el = document.createElement("span");
		pulseClass(el, "word-miss", "word-shake");
		el.dispatchEvent(animationEvent("animationcancel", "word-shake"));
		expect(el.classList.contains("word-miss")).toBe(false);
	});

	it("ignores other animations ending on the element", () => {
		const el = document.createElement("div");
		pulseClass(el, "caret-miss", "caret-miss");
		el.dispatchEvent(animationEvent("animationcancel", "caret-blink"));
		expect(el.classList.contains("caret-miss")).toBe(true);
	});

	it("lets a running pulse finish instead of stacking listeners", () => {
		const el = document.createElement("span");
		pulseClass(el, "word-miss", "word-shake");
		pulseClass(el, "word-miss", "word-shake");
		el.dispatchEvent(animationEvent("animationend", "word-shake"));
		expect(el.classList.contains("word-miss")).toBe(false);

		pulseClass(el, "word-miss", "word-shake");
		expect(el.classList.contains("word-miss")).toBe(true);
	});

	it("is a no-op without an element", () => {
		expect(() => pulseClass(undefined, "x", "x")).not.toThrow();
	});
});
