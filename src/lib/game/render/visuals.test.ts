import { describe, expect, it } from "vitest";
import { ENEMIES } from "../content/enemies";
import {
	FALLBACK_VISUAL,
	FAMILY_VISUALS,
	tierScale,
	visualFor,
} from "./visuals";

describe("visuals", () => {
	it("resolves every roster archetype to a family recipe", () => {
		for (const arch of ENEMIES) {
			const v = visualFor(arch.id);
			expect(v).not.toBe(FALLBACK_VISUAL);
			// the resolved family is a prefix of the archetype id
			expect(arch.id.startsWith(v.family)).toBe(true);
		}
	});

	it("resolves every roster family to a distinct color", () => {
		const families = new Set(ENEMIES.map((e) => e.id.split("-")[0]));
		// bosses share the "boss" family
		const roster = [...families].map((f) => (f === "boss" ? "boss" : f));
		const colors = new Set(
			roster.map((f) => visualFor(`${f}-1`).color.join(",")),
		);
		expect(colors.size).toBe(new Set(roster).size);
	});

	it("gives bosses an icosphere shape with high emissive", () => {
		const boss = visualFor("boss-maw");
		expect(boss.family).toBe("boss");
		expect(boss.shape).toBe("icosphere");
		const luminance = boss.emissive.reduce((a, b) => a + b, 0);
		expect(luminance).toBeGreaterThan(0.5);
	});

	it("prefers the longest matching prefix", () => {
		// sanity: a "boss" id must not accidentally match a shorter family
		expect(visualFor("boss-hive").family).toBe("boss");
		expect(visualFor("husk-4").family).toBe("husk");
	});

	it("falls back for unknown archetypes", () => {
		expect(visualFor("unknown-thing")).toBe(FALLBACK_VISUAL);
	});

	it("has unique family names in the recipe table", () => {
		const names = FAMILY_VISUALS.map((f) => f.family);
		expect(new Set(names).size).toBe(names.length);
	});

	it("scales tiers monotonically", () => {
		expect(tierScale(1)).toBe(1);
		expect(tierScale(1)).toBeLessThan(tierScale(2));
		expect(tierScale(2)).toBeLessThan(tierScale(3));
		expect(tierScale(3)).toBeLessThan(tierScale(4));
	});
});
