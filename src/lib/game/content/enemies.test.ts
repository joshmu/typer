import { describe, expect, it } from "vitest";
import { createEnemy } from "../sim/enemy-factory";
import { dist } from "../sim/math";
import { MOVEMENTS as MOVEMENT_FNS } from "../sim/movement";
import { steer } from "../sim/physics";
import { ARENA } from "../sim/state";
import { ENEMIES, getArchetype, type MovementId } from "./enemies";

const MOVEMENTS: MovementId[] = [
	"chase",
	"zigzag",
	"orbit-then-dive",
	"dash-pause",
	"flank",
	"spiral",
	"spiral-fast",
	"feint",
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
	it("has at least 32 archetypes", () => {
		expect(ENEMIES.length).toBeGreaterThanOrEqual(32);
	});

	it("has unique ids", () => {
		const ids = ENEMIES.map((e) => e.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("has 26 regulars and 6 bosses", () => {
		expect(ENEMIES.filter((e) => e.role === "regular").length).toBe(26);
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

	it("gives survivable straight-line travel from the spawn edge (regulars 18-55s, bosses 40-70s)", () => {
		// The arena must read as a large top-down field an enemy takes many seconds
		// to cross. At 60 ticks/s a straight run from the spawn edge to the core is
		// spawnRadius / (speed * 60) seconds. Regulars stay in a survivable band;
		// bosses lumber in slower still. Movement multipliers (dash 2.2x, dive 1.6x)
		// only shorten the *tail* of a run, so the straight-line bound is the floor
		// on how long a family pressures the core. Bands re-derived for the 51-unit
		// arena (playtest 2026-07-12: grown 1.5× for softer pacing).
		const TPS = 60;
		for (const e of ENEMIES) {
			const seconds = ARENA.spawnRadius / (e.speed * TPS);
			if (e.role === "regular") {
				expect(seconds).toBeGreaterThanOrEqual(18);
				expect(seconds).toBeLessThanOrEqual(55);
			} else {
				expect(seconds).toBeGreaterThanOrEqual(40);
				expect(seconds).toBeLessThanOrEqual(70);
			}
		}
	});

	it("lunger's feint journey (sprint → retreat → creep) lands in ~18-70s", () => {
		// the straight-line band assumes a constant speed; the feint sprints (×3),
		// recoils (~90 ticks outward at ×0.5), then creeps in (×0.4), so its
		// effective arrival needs a phase-aware simulation. Integrate exactly as
		// step() does (steer toward the desired velocity, then advance position)
		// from the spawn edge and assert the whole journey stays survivable.
		const TPS = 60;
		const arch = getArchetype("lunger-1");
		const e = createEnemy(arch, 1, { x: ARENA.spawnRadius, y: 0 }, 0, [
			"x",
			"y",
		]);
		let ticks = 0;
		const MAX = 80 * TPS;
		while (dist(e.pos.x, e.pos.y) > ARENA.killRadius && ticks < MAX) {
			steer(e, MOVEMENT_FNS.feint(e, ticks), 1);
			e.pos.x += e.vel.x;
			e.pos.y += e.vel.y;
			ticks += 1;
		}
		expect(dist(e.pos.x, e.pos.y)).toBeLessThanOrEqual(ARENA.killRadius);
		const seconds = ticks / TPS;
		expect(seconds).toBeGreaterThanOrEqual(18);
		expect(seconds).toBeLessThanOrEqual(70);
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
