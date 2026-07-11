import { describe, expect, it } from "vitest";
import type { Ability } from "../content/enemies";
import {
	absorbsCompletion,
	isCloaked,
	isTargetable,
	tickAbility,
} from "./abilities";
import { ARENA, createInitialState, type EnemyState } from "./state";

function enemyWith(
	ability: Ability | null,
	over: Partial<EnemyState> = {},
): EnemyState {
	return {
		id: 1,
		archetypeId: "x",
		pos: { x: 8, y: 0 },
		vel: { x: 0, y: 0 },
		word: "the",
		typedCount: 0,
		hp: 4,
		maxHp: 4,
		alive: true,
		spawnTick: 0,
		speed: 0.03,
		tier: 2,
		movement: "chase",
		ability,
		abilityState: {
			shieldHits: ability?.kind === "shield" ? ability.hits : 0,
			enraged: false,
		},
		...over,
	};
}

describe("abilities", () => {
	it("shield absorbs completions until hits are spent", () => {
		const e = enemyWith({ kind: "shield", hits: 2 });
		expect(absorbsCompletion(e)).toBe(true);
		expect(e.abilityState.shieldHits).toBe(1);
		expect(absorbsCompletion(e)).toBe(true);
		expect(e.abilityState.shieldHits).toBe(0);
		expect(absorbsCompletion(e)).toBe(false);
	});

	it("armored-front absorbs while far, exposes when close", () => {
		const far = enemyWith(
			{ kind: "armored-front", exposeRadius: 4 },
			{ pos: { x: 8, y: 0 } },
		);
		const near = enemyWith(
			{ kind: "armored-front", exposeRadius: 4 },
			{ pos: { x: 2, y: 0 } },
		);
		expect(absorbsCompletion(far)).toBe(true);
		expect(absorbsCompletion(near)).toBe(false);
	});

	it("cloak toggles targetability on its interval", () => {
		const e = enemyWith({ kind: "cloak", interval: 30 });
		expect(isTargetable(e, 0)).toBe(true);
		expect(isTargetable(e, 30)).toBe(false);
		expect(isTargetable(e, 60)).toBe(true);
	});

	it("non-cloak enemies are always targetable", () => {
		expect(isTargetable(enemyWith(null), 30)).toBe(true);
	});

	it("isCloaked mirrors the hidden phase of cloakers only", () => {
		const cloaker = enemyWith({ kind: "cloak", interval: 30 });
		expect(isCloaked(cloaker, 0)).toBe(false); // visible phase
		expect(isCloaked(cloaker, 30)).toBe(true); // hidden phase
		expect(isCloaked(cloaker, 60)).toBe(false);
		// non-cloak enemies are never cloaked
		expect(isCloaked(enemyWith(null), 30)).toBe(false);
	});

	it("enrage-at-half latches a one-time speed boost", () => {
		const s = createInitialState(1);
		const e = enemyWith(
			{ kind: "enrage-at-half", speedMult: 2 },
			{ hp: 2, maxHp: 4, speed: 0.03 },
		);
		s.enemies = [e];
		tickAbility(s, e);
		expect(e.abilityState.enraged).toBe(true);
		expect(e.speed).toBeCloseTo(0.06, 6);
		tickAbility(s, e); // does not stack
		expect(e.speed).toBeCloseTo(0.06, 6);
	});

	it("spawn emits a minion on its cadence", () => {
		const s = createInitialState(1);
		const e = enemyWith(
			{ kind: "spawn", minion: "husk-1", rate: 20 },
			{ spawnTick: 0 },
		);
		s.enemies = [e];
		s.tick = 20;
		tickAbility(s, e);
		expect(s.enemies.filter((x) => x.archetypeId === "husk-1").length).toBe(1);
	});

	it("teleport blinks the enemy inward on its cadence", () => {
		const s = createInitialState(1);
		const e = enemyWith(
			{ kind: "teleport", interval: 20, range: 3 },
			{ pos: { x: 10, y: 0 } },
		);
		s.enemies = [e];
		s.tick = 20;
		const before = Math.hypot(e.pos.x, e.pos.y);
		tickAbility(s, e);
		expect(Math.hypot(e.pos.x, e.pos.y)).toBeLessThan(before);
	});

	it("teleport clamps its jump so it never blinks into the kill ring", () => {
		const s = createInitialState(1);
		// d = 4, range = 3: an unclamped jump would land the enemy at d = 1 (well
		// inside the kill ring); the clamp must keep it at >= killRadius * 2.
		const e = enemyWith(
			{ kind: "teleport", interval: 20, range: 3 },
			{ pos: { x: 4, y: 0 } },
		);
		s.enemies = [e];
		s.tick = 20;
		tickAbility(s, e);
		const d = Math.hypot(e.pos.x, e.pos.y);
		expect(d).toBeGreaterThanOrEqual(ARENA.killRadius * 2 - 1e-9);
		expect(d).toBeGreaterThan(ARENA.killRadius);
	});

	it("heal-aura restores nearby wounded allies on its pulse", () => {
		const s = createInitialState(1);
		const healer = enemyWith(
			{ kind: "heal-aura", radius: 5, amount: 1, interval: 20 },
			{ id: 1, pos: { x: 0, y: 0 } },
		);
		const ally = enemyWith(null, {
			id: 2,
			pos: { x: 2, y: 0 },
			hp: 1,
			maxHp: 4,
		});
		s.enemies = [healer, ally];
		s.tick = 20;
		tickAbility(s, healer);
		expect(s.enemies.find((x) => x.id === 2)?.hp).toBe(2);
	});
});
