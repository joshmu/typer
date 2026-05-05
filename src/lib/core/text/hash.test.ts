import { describe, expect, it } from "vitest";
import { simpleHash } from "./hash";

describe("simpleHash", () => {
	it("returns a base-36 string", () => {
		expect(simpleHash("hello")).toMatch(/^-?[0-9a-z]+$/);
	});

	it("is deterministic for the same input", () => {
		expect(simpleHash("the quick brown fox")).toBe(
			simpleHash("the quick brown fox"),
		);
	});

	it("differs for different inputs", () => {
		expect(simpleHash("a")).not.toBe(simpleHash("b"));
		expect(simpleHash("hello")).not.toBe(simpleHash("hello world"));
	});

	it("returns a stable value for the empty string", () => {
		expect(simpleHash("")).toBe("0");
	});
});
