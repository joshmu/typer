import { describe, expect, it } from "vitest";
import { MAX_ALIVE, spawnFromArchetype } from "./spawner";
import { createInitialState, type EnemyState, type GameState } from "./state";
import { type GameEvent, step } from "./step";

function cloaker(over: Partial<EnemyState> = {}): EnemyState {
	return {
		id: 1,
		archetypeId: "darter-2",
		pos: { x: 8, y: 0 },
		word: "zephyr",
		typedCount: 0,
		hp: 1,
		maxHp: 1,
		alive: true,
		spawnTick: 0,
		speed: 0.001,
		tier: 2,
		movement: "chase",
		ability: { kind: "cloak", interval: 30 },
		abilityState: { shieldHits: 0, enraged: false },
		...over,
	};
}

function run(
	s: GameState,
	ticks: number,
	keysAt: Record<number, string[]> = {},
) {
	let state = s;
	for (let i = 0; i < ticks; i++) {
		const keys = keysAt[state.tick + 1] ?? [];
		state = step(
			state,
			keys.map((k): GameEvent => ({ type: "key", key: k })),
		);
	}
	return state;
}

function advanceToFirstEnemy(seed: number): GameState {
	let s = createInitialState(seed);
	while (s.enemies.filter((e) => e.alive).length === 0 && s.tick < 4000) {
		s = step(s, []);
	}
	return s;
}

describe("step", () => {
	it("opens in an intermission then starts wave 1", () => {
		const s = run(createInitialState(42), 61);
		expect(s.wave).toBe(1);
		expect(s.wavePhase).toBe("active");
	});

	it("spawns enemies once a wave is active", () => {
		const s = advanceToFirstEnemy(42);
		expect(s.enemies.filter((e) => e.alive).length).toBeGreaterThanOrEqual(1);
	});

	it("caps alive enemies at MAX_ALIVE", () => {
		const s = run(createInitialState(42), 60 * 120);
		expect(s.enemies.filter((e) => e.alive).length).toBeLessThanOrEqual(
			MAX_ALIVE,
		);
	});

	it("enemies move toward the player", () => {
		const a = advanceToFirstEnemy(42);
		const b = step(a, []);
		const ea = a.enemies.find((e) => e.alive);
		const eb = b.enemies.find((e) => e.id === ea?.id);
		if (!ea || !eb) throw new Error("expected a live enemy");
		expect(Math.hypot(eb.pos.x, eb.pos.y)).toBeLessThan(
			Math.hypot(ea.pos.x, ea.pos.y),
		);
	});

	it("typing the full word kills the target", () => {
		let s = advanceToFirstEnemy(42);
		const target = s.enemies.find((e) => e.alive);
		if (!target) throw new Error("expected a live enemy");
		const word = target.word;
		for (const ch of word) {
			s = step(s, [{ type: "key", key: ch }]);
		}
		expect(s.kills).toBe(1);
		expect(s.enemies.find((e) => e.id === target.id)).toBe(undefined);
		expect(s.targetId).toBeNull();
		expect(s.score).toBe(10 * word.length);
	});

	it("counts a miss without breaking the lock", () => {
		let s = advanceToFirstEnemy(42);
		const target = s.enemies.find((e) => e.alive);
		if (!target) throw new Error("expected a live enemy");
		s = step(s, [{ type: "key", key: target.word[0] }]);
		const locked = s.targetId;
		s = step(s, [{ type: "key", key: "¤" }]);
		expect(s.misses).toBe(1);
		expect(s.targetId).toBe(locked);
	});

	it("enemies reaching the player eventually end the game", () => {
		const s = run(createInitialState(42), 60 * 60 * 8); // 8 sim minutes untyped
		expect(s.playerHp).toBe(0);
		expect(s.status).toBe("gameover");
	});

	it("ignores a key that matches only a cloaked enemy's initial (no miss, no combo break)", () => {
		let s = createInitialState(1);
		s.wavePhase = "active";
		s.enemies = [cloaker({ word: "zephyr" })];
		s.tick = 30; // steps to 31: (31 - 0) % 60 = 31 >= 30 → hidden phase
		s.combo = 5;
		s.comboTicksLeft = 100;
		s = step(s, [{ type: "key", key: "z" }]);
		expect(s.misses).toBe(0); // hidden enemy's initial → no penalty
		expect(s.combo).toBe(5); // combo not broken
		expect(s.targetId).toBeNull(); // untargetable, so not acquired
	});

	it("still counts a miss when a key matches nothing at all", () => {
		let s = createInitialState(1);
		s.wavePhase = "active";
		s.enemies = [cloaker({ word: "zephyr" })];
		s.tick = 30;
		s = step(s, [{ type: "key", key: "q" }]); // matches neither cloaked nor any
		expect(s.misses).toBe(1);
	});

	it("keeps a cloaked enemy's initial reserved for new spawns", () => {
		const s = createInitialState(5);
		s.enemies = [cloaker({ word: "xylophone", pos: { x: 8, y: 0 } })];
		s.tick = 30;
		for (let i = 0; i < 8; i++)
			spawnFromArchetype(s, "husk-1", { x: 20, y: 0 });
		for (const e of s.enemies) {
			if (e.id !== 1) expect(e.word[0]).not.toBe("x");
		}
	});

	it("spawns a powerup when the kill milestone advances", () => {
		let s = createInitialState(1);
		s.kills = 12;
		s = step(s, []);
		expect(s.powerups.length).toBe(1);
		expect(s.lastPowerupMilestone).toBe(1);
	});

	it("does not miss a milestone when a double-kill tick skips the multiple", () => {
		let s = createInitialState(1);
		s.kills = 13; // jumped past 12 without ever landing on it
		s.lastPowerupMilestone = 0;
		s = step(s, []);
		expect(s.powerups.length).toBe(1); // an exact `kills % 12` check would miss this
		expect(s.lastPowerupMilestone).toBe(1);
	});

	it("does not re-trigger a powerup for an already-passed milestone", () => {
		let s = createInitialState(1);
		s.kills = 12;
		s.lastPowerupMilestone = 1; // already claimed
		s = step(s, []);
		expect(s.powerups.length).toBe(0);
	});

	it("is pure — same inputs, same output, no input mutation", () => {
		const s0 = createInitialState(7);
		const frozen = JSON.stringify(s0);
		const a = step(s0, []);
		const b = step(s0, []);
		expect(JSON.stringify(s0)).toBe(frozen);
		expect(a).toEqual(b);
	});
});
