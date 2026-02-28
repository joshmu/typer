import { describe, expect, it } from "vitest";
import { add } from "./index";

describe("calc smoke test", () => {
	it("adds two numbers", () => {
		expect(add(1, 2)).toBe(3);
	});

	it("handles negative numbers", () => {
		expect(add(-1, 1)).toBe(0);
	});

	it("handles zero", () => {
		expect(add(0, 0)).toBe(0);
	});
});
