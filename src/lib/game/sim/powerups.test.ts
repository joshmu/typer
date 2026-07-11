import { describe, expect, it } from "vitest";
import { getArchetype } from "../content/enemies";
import { createEnemy } from "./enemy-factory";
import {
	applyPowerup,
	FREEZE_TICKS,
	SLOW_TICKS,
	spawnPowerup,
} from "./powerups";
import { createInitialState } from "./state";

describe("powerups", () => {
	it("spawnPowerup adds one word-labelled pickup deterministically", () => {
		const a = createInitialState(9);
		const b = createInitialState(9);
		spawnPowerup(a);
		spawnPowerup(b);
		expect(a.powerups.length).toBe(1);
		expect(a.powerups[0].word.length).toBeGreaterThan(0);
		expect(a.powerups[0]).toEqual(b.powerups[0]);
		expect(a.nextPowerupId).toBe(2);
	});

	it("freeze sets the freeze timer", () => {
		const s = createInitialState(1);
		applyPowerup(s, "freeze");
		expect(s.freezeTicksLeft).toBe(FREEZE_TICKS);
	});

	it("slow sets the slow timer", () => {
		const s = createInitialState(1);
		applyPowerup(s, "slow");
		expect(s.slowTicksLeft).toBe(SLOW_TICKS);
	});

	it("heal restores one hp capped at maxPlayerHp", () => {
		const s = createInitialState(1);
		s.playerHp = 1;
		applyPowerup(s, "heal");
		expect(s.playerHp).toBe(2);
		s.playerHp = 3;
		applyPowerup(s, "heal");
		expect(s.playerHp).toBe(3);
	});

	it("bomb kills every alive enemy", () => {
		const s = createInitialState(1);
		s.enemies = [
			createEnemy(getArchetype("grunt"), 1, { x: 5, y: 0 }, 0, "the"),
			createEnemy(getArchetype("grunt"), 2, { x: -5, y: 0 }, 0, "and"),
		];
		s.nextEnemyId = 3;
		applyPowerup(s, "bomb");
		expect(s.enemies.every((e) => !e.alive)).toBe(true);
	});
});
