import { describe, expect, it } from "vitest";
import { MOVEMENTS as MOVEMENT_FNS } from "../sim/movement";
import { ARENA } from "../sim/state";
import { ENEMIES, getArchetype, type MovementId } from "./enemies";

const MOVEMENTS: MovementId[] = [
	"chase",
	"zigzag",
	"orbit-then-dive",
	"dash-pause",
	"flank",
	"spiral",
];
const ABILITY_KINDS = [
	"split",
	"shield",
	"cloak",
	"spawn",
	"heal-aura",
	"enrage-at-half",
	"teleport",
	"armored-front",
];

describe("enemy roster", () => {
	it("has at least 30 archetypes", () => {
		expect(ENEMIES.length).toBeGreaterThanOrEqual(30);
	});

	it("has unique ids", () => {
		const ids = ENEMIES.map((e) => e.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("has 24 regulars and 6 bosses", () => {
		expect(ENEMIES.filter((e) => e.role === "regular").length).toBe(24);
		expect(ENEMIES.filter((e) => e.role === "boss").length).toBe(6);
	});

	it("has valid stats, movement and tier on every entry", () => {
		for (const e of ENEMIES) {
			expect(e.hp).toBeGreaterThan(0);
			expect(e.speed).toBeGreaterThan(0);
			expect(e.size).toBeGreaterThan(0);
			expect([1, 2, 3, 4]).toContain(e.tier);
			expect(MOVEMENTS).toContain(e.movement);
		}
	});

	it("covers all four tiers and all six movements", () => {
		for (const t of [1, 2, 3, 4]) {
			expect(ENEMIES.some((e) => e.tier === t)).toBe(true);
		}
		for (const m of MOVEMENTS) {
			expect(ENEMIES.some((e) => e.movement === m)).toBe(true);
		}
	});

	it("uses every ability kind at least once with valid minion refs", () => {
		const ids = new Set(ENEMIES.map((e) => e.id));
		const seen = new Set<string>();
		for (const e of ENEMIES) {
			if (!e.ability) continue;
			expect(ABILITY_KINDS).toContain(e.ability.kind);
			seen.add(e.ability.kind);
			if (e.ability.kind === "split" || e.ability.kind === "spawn") {
				expect(ids.has(e.ability.minion)).toBe(true);
			}
		}
		for (const kind of ABILITY_KINDS) expect(seen.has(kind)).toBe(true);
	});

	it("bosses are multi-word chains (hp 3-5)", () => {
		for (const b of ENEMIES.filter((e) => e.role === "boss")) {
			expect(b.hp).toBeGreaterThanOrEqual(3);
			expect(b.hp).toBeLessThanOrEqual(5);
		}
	});

	it("gives survivable straight-line travel from the spawn edge (regulars 13-45s, bosses 20-60s)", () => {
		// The arena must read as a large top-down field an enemy takes many seconds
		// to cross. At 60 ticks/s a straight run from the spawn edge to the core is
		// spawnRadius / (speed * 60) seconds. Regulars stay in a survivable band;
		// bosses lumber in slower still. Movement multipliers (dash 2.2x, dive 1.6x)
		// only shorten the *tail* of a run, so the straight-line bound is the floor
		// on how long a family pressures the core.
		const TPS = 60;
		for (const e of ENEMIES) {
			const seconds = ARENA.spawnRadius / (e.speed * TPS);
			if (e.role === "regular") {
				expect(seconds).toBeGreaterThanOrEqual(13);
				expect(seconds).toBeLessThanOrEqual(45);
			} else {
				expect(seconds).toBeGreaterThanOrEqual(20);
				expect(seconds).toBeLessThanOrEqual(60);
			}
		}
	});

	it("looks up by id and throws on unknown", () => {
		expect(getArchetype("husk-1").name).toBe("Huskling");
		expect(() => getArchetype("nope")).toThrow();
	});

	it("every movement id resolves to a real handler in the sim's dispatch table", () => {
		const movementKeys = new Set(Object.keys(MOVEMENT_FNS));
		for (const e of ENEMIES) {
			expect(movementKeys.has(e.movement)).toBe(true);
		}
	});

	it("each tier's word band is non-empty", async () => {
		const { pickWordForTier } = await import("./words");
		const { createRngState } = await import("../sim/rng");
		for (const tier of [1, 2, 3, 4] as const) {
			const [word] = pickWordForTier(tier, createRngState(1), new Set());
			expect(word.length).toBeGreaterThan(0);
		}
	});
});
