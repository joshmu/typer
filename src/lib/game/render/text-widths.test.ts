import { describe, expect, it, vi } from "vitest";
import { createTextWidths } from "./text-widths";

function fakeCtx() {
	const ctx = {
		font: "",
		measureText: vi.fn((text: string) => ({
			width: text.length * (ctx.font.includes("80px") ? 10 : 5),
		})),
	};
	return ctx;
}

describe("createTextWidths", () => {
	it("measures each text in each font once", () => {
		const widths = createTextWidths();
		const c = fakeCtx();
		expect(widths.of(c, "bold 80px m", "abc")).toBe(30);
		expect(widths.of(c, "bold 80px m", "abc")).toBe(30);
		expect(widths.of(c, "bold 40px m", "abc")).toBe(15);
		expect(c.measureText).toHaveBeenCalledTimes(2);
	});

	it("leaves the context in the font it measured with", () => {
		const widths = createTextWidths();
		const c = fakeCtx();
		widths.of(c, "bold 40px m", "a");
		widths.of(c, "bold 80px m", "a");
		expect(c.font).toBe("bold 80px m");
		c.font = "x";
		widths.of(c, "bold 40px m", "a");
		expect(c.font).toBe("bold 40px m");
	});

	it("measures again after the font changes under it", () => {
		const widths = createTextWidths();
		const c = fakeCtx();
		widths.of(c, "bold 80px m", "abc");
		widths.forget();
		widths.of(c, "bold 80px m", "abc");
		expect(c.measureText).toHaveBeenCalledTimes(2);
	});

	it("stays bounded", () => {
		const widths = createTextWidths(4);
		const c = fakeCtx();
		for (let i = 0; i < 10; i++) widths.of(c, "f", `w${i}`);
		expect(widths.size()).toBeLessThanOrEqual(4);
	});
});
