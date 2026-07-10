import { describe, expect, it } from "vitest";
import { fnv1a, simpleHash } from "./hash";

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

describe("fnv1a", () => {
	it("matches the FNV-1a offset basis for the empty string", () => {
		expect(fnv1a("")).toBe("811c9dc5");
	});

	it("is deterministic for the same input", () => {
		expect(fnv1a("the quick brown fox")).toBe(fnv1a("the quick brown fox"));
	});

	it("differs for different inputs", () => {
		expect(fnv1a("a")).not.toBe(fnv1a("b"));
	});
});
