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

	it("spawnPowerup avoids reusing an existing powerup's initial", () => {
		// discover the word spawnPowerup would pick from this exact rng state
		const probe = createInitialState(9);
		spawnPowerup(probe);
		const wouldPick = probe.powerups[0].word;

		// plant a live pickup that already owns that initial, then spawn from the
		// identical rng state: two on-field powerups sharing word[0] would make the
		// first keystroke ambiguous, so the new pickup must choose a distinct initial
		const s = createInitialState(9);
		s.powerups = [
			{
				id: 99,
				kind: "heal",
				word: wouldPick,
				typedCount: 0,
				pos: { x: 0, y: 0 },
				expiresTick: 999,
			},
		];
		spawnPowerup(s);
		const spawned = s.powerups.find((p) => p.id !== 99);
		expect(spawned).toBeDefined();
		expect(spawned?.word[0]).not.toBe(wouldPick[0]);
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
			createEnemy(getArchetype("husk-1"), 1, { x: 5, y: 0 }, 0, "the"),
			createEnemy(getArchetype("husk-1"), 2, { x: -5, y: 0 }, 0, "and"),
		];
		s.nextEnemyId = 3;
		applyPowerup(s, "bomb");
		expect(s.enemies.every((e) => !e.alive)).toBe(true);
	});
});
