import { describe, expect, it } from "vitest";
import { ENEMIES } from "../content/enemies";
import type { PowerupKind } from "../sim/state";
import {
	FALLBACK_VISUAL,
	FAMILY_VISUALS,
	powerupVisual,
	tierTint,
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

	it("gives bosses the highest emissive", () => {
		const boss = visualFor("boss-maw");
		expect(boss.family).toBe("boss");
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

	it("maps every powerup kind to a distinct, emissive color recipe", () => {
		const kinds: PowerupKind[] = ["freeze", "bomb", "heal", "slow"];
		const colors = new Set(kinds.map((k) => powerupVisual(k).color.join(",")));
		expect(colors.size).toBe(kinds.length);
		for (const k of kinds) {
			const lum = powerupVisual(k).emissive.reduce((a, b) => a + b, 0);
			expect(lum).toBeGreaterThan(0);
		}
	});

	it("tints tiers brighter monotonically without leaving the color range", () => {
		const base: [number, number, number] = [0.6, 0.3, 0.2];
		const lum = ([r, g, b]: [number, number, number]) => r + g + b;
		const tints = [1, 2, 3, 4].map((t) => tierTint(base, t as 1 | 2 | 3 | 4));
		for (let i = 1; i < tints.length; i++) {
			expect(lum(tints[i])).toBeGreaterThan(lum(tints[i - 1]));
		}
		for (const t of tints) {
			for (const c of t) {
				expect(c).toBeGreaterThanOrEqual(0);
				expect(c).toBeLessThanOrEqual(1);
			}
		}
	});
});
