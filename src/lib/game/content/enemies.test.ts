import { describe, expect, it } from "vitest";
import { ENEMIES, getArchetype } from "./enemies";

describe("enemy content", () => {
	it("has valid archetypes", () => {
		expect(ENEMIES.length).toBeGreaterThanOrEqual(1);
		for (const e of ENEMIES) {
			expect(e.hp).toBeGreaterThan(0);
			expect(e.speed).toBeGreaterThan(0);
		}
	});
	it("looks up by id and throws on unknown", () => {
		expect(getArchetype("grunt").name).toBe("Grunt");
		expect(() => getArchetype("nope")).toThrow();
	});
});
