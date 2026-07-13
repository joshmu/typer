import { describe, expect, it } from "vitest";
import type { EnemyArchetype } from "../content/enemies";
import { createEnemy, initAbilityState } from "./enemy-factory";

const shielded: EnemyArchetype = {
	id: "test-shielded",
	name: "Test",
	hp: 3,
	speed: 0.03,
	size: 1,
	tier: 2,
	movement: "zigzag",
	ability: { kind: "shield", hits: 2 },
	role: "regular",
};

describe("enemy-factory", () => {
	it("initialises ability state from a shield ability", () => {
		expect(initAbilityState(shielded.ability)).toEqual({
			shieldHits: 2,
			enraged: false,
		});
	});
	it("initialises empty ability state for no ability", () => {
		expect(initAbilityState(null)).toEqual({ shieldHits: 0, enraged: false });
	});
	it("denormalises archetype fields onto the enemy (hp derives from the chain)", () => {
		// hp/maxHp come from the CHAIN length, not arch.hp — `words.length === hp`
		// is the universal invariant (bosses field a whole sentence that overrides
		// their nominal archetype hp).
		const e = createEnemy(shielded, 7, { x: 1, y: 2 }, 100, [
			"alpha",
			"bravo",
			"delta",
		]);
		expect(e.id).toBe(7);
		expect(e.hp).toBe(3);
		expect(e.maxHp).toBe(3);
		expect(e.words).toEqual(["alpha", "bravo", "delta"]);
		expect(e.wordIndex).toBe(0);
		expect(e.typedCount).toBe(0);
		expect(e.speed).toBe(0.03);
		expect(e.tier).toBe(2);
		expect(e.movement).toBe("zigzag");
		expect(e.spawnTick).toBe(100);
		expect(e.abilityState.shieldHits).toBe(2);
		expect(e.alive).toBe(true);
	});
});
