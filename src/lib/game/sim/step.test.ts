import { describe, expect, it } from "vitest";
import { getArchetype } from "../content/enemies";
import { createEnemy } from "./enemy-factory";
import { MAX_ALIVE, spawnFromArchetype } from "./spawner";
import {
	createInitialState,
	currentWord,
	type EnemyState,
	type GameState,
} from "./state";
import { type GameEvent, step } from "./step";

function cloaker(over: Partial<EnemyState> = {}): EnemyState {
	return {
		id: 1,
		archetypeId: "darter-2",
		pos: { x: 8, y: 0 },
		vel: { x: 0, y: 0 },
		words: ["zephyr"],
		wordIndex: 0,
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
		const word = currentWord(target);
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
		s = step(s, [{ type: "key", key: currentWord(target)[0] }]);
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
		s.enemies = [cloaker({ words: ["zephyr"] })];
		s.tick = 30; // steps to 31: (31 - 0) % 60 = 31 >= 30 → hidden phase
		s.combo = 5;
		s.comboTicksLeft = 100;
		s = step(s, [{ type: "key", key: "z" }]);
		expect(s.misses).toBe(0); // hidden enemy's initial → no penalty
		expect(s.combo).toBe(5); // combo not broken
		expect(s.targetId).toBeNull(); // untargetable, so not acquired
	});

	it("swallows a key matching a partially-typed cloaked enemy's next-needed char (no miss, no combo break, no advance)", () => {
		let s = createInitialState(1);
		s.wavePhase = "active";
		// unlocked, partially-typed cloaker: typed "ze", next-needed 'p'
		s.enemies = [cloaker({ words: ["zephyr"], typedCount: 2 })];
		s.tick = 30; // steps to 31 → hidden phase
		s.combo = 5;
		s.comboTicksLeft = 100;
		s = step(s, [{ type: "key", key: "p" }]); // its NEXT char, not the initial
		expect(s.misses).toBe(0); // hidden enemy's next char → no penalty
		expect(s.combo).toBe(5); // combo not broken
		expect(s.targetId).toBeNull(); // untargetable, so not acquired
		expect(s.enemies[0].typedCount).toBe(2); // progress unchanged, no advance
	});

	it("still counts a miss when a key matches nothing at all", () => {
		let s = createInitialState(1);
		s.wavePhase = "active";
		s.enemies = [cloaker({ words: ["zephyr"] })];
		s.tick = 30;
		s = step(s, [{ type: "key", key: "q" }]); // matches neither cloaked nor any
		expect(s.misses).toBe(1);
	});

	it("keeps a cloaked enemy's initial reserved for new spawns", () => {
		const s = createInitialState(5);
		s.enemies = [cloaker({ words: ["xylophone"], pos: { x: 8, y: 0 } })];
		s.tick = 30;
		for (let i = 0; i < 8; i++)
			spawnFromArchetype(s, "husk-1", { x: 20, y: 0 });
		for (const e of s.enemies) {
			if (e.id !== 1) expect(currentWord(e)[0]).not.toBe("x");
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

	it("keeps velocity inert through a freeze and never scatters on unfreeze", () => {
		let s = createInitialState(1);
		s.wavePhase = "active";
		s.spawnQueueRemaining = 0; // no new spawns inside the test window
		// two heavily-overlapping chasers: without gating velocity work, steer and
		// separation would pump their velocity every frozen tick and fling them
		// apart the instant the freeze lifts
		const a = createEnemy(getArchetype("husk-1"), 1, { x: 5, y: 0 }, 0, [
			"alpha",
		]);
		const b = createEnemy(getArchetype("husk-1"), 2, { x: 5.1, y: 0 }, 0, [
			"bravo",
		]);
		s.enemies = [a, b];
		s.nextEnemyId = 3;
		s.freezeTicksLeft = 180;

		for (let i = 0; i < 180; i++) s = step(s, []);
		expect(s.freezeTicksLeft).toBe(0);
		// no velocity accumulated across the whole freeze
		for (const e of s.enemies) {
			expect(Math.hypot(e.vel.x, e.vel.y)).toBeLessThan(1e-9);
		}

		// first unfrozen tick: a single ordinary step, not an accumulated fling
		const before = new Map(
			s.enemies.map((e) => [e.id, { x: e.pos.x, y: e.pos.y }]),
		);
		s = step(s, []);
		for (const e of s.enemies) {
			const p = before.get(e.id);
			if (!p) continue;
			expect(Math.hypot(e.pos.x - p.x, e.pos.y - p.y)).toBeLessThan(0.05);
		}
	});

	it("free-flow: switching targets mid-word preserves both enemies' progress", () => {
		let s = createInitialState(1);
		s.wavePhase = "active";
		s.spawnQueueRemaining = 0;
		s.enemies = [
			createEnemy(getArchetype("husk-1"), 1, { x: 12, y: 0 }, 0, ["alpha"]),
			createEnemy(getArchetype("husk-1"), 2, { x: 18, y: 0 }, 0, ["bravo"]),
		];
		s.nextEnemyId = 3;
		s = step(s, [{ type: "key", key: "a" }]); // acquire A
		s = step(s, [{ type: "key", key: "l" }]); // advance A → "al" (next 'p')
		expect(s.targetId).toBe(1);
		expect(s.enemies.find((e) => e.id === 1)?.typedCount).toBe(2);

		// 'b' does not continue A but matches B's initial → re-route (NOT a miss)
		const missesBefore = s.misses;
		s = step(s, [{ type: "key", key: "b" }]);
		expect(s.targetId).toBe(2);
		expect(s.misses).toBe(missesBefore);
		expect(s.enemies.find((e) => e.id === 1)?.typedCount).toBe(2); // A kept
		expect(s.enemies.find((e) => e.id === 2)?.typedCount).toBe(1); // B advanced
	});

	it("free-flow: returning to a partial target resumes at its saved count", () => {
		let s = createInitialState(1);
		s.wavePhase = "active";
		s.spawnQueueRemaining = 0;
		s.enemies = [
			createEnemy(getArchetype("husk-1"), 1, { x: 12, y: 0 }, 0, ["alpha"]),
			createEnemy(getArchetype("husk-1"), 2, { x: 18, y: 0 }, 0, ["bravo"]),
		];
		s.nextEnemyId = 3;
		s = step(s, [{ type: "key", key: "a" }]);
		s = step(s, [{ type: "key", key: "l" }]); // A at typedCount 2 (next 'p')
		s = step(s, [{ type: "key", key: "b" }]); // route to B
		// 'p' continues A ("al|pha") — resume at saved count, not from zero
		s = step(s, [{ type: "key", key: "p" }]);
		expect(s.targetId).toBe(1);
		expect(s.enemies.find((e) => e.id === 1)?.typedCount).toBe(3);
	});

	it("free-flow: the nearest of two partials wins the routing tie-break", () => {
		let s = createInitialState(1);
		s.wavePhase = "active";
		s.spawnQueueRemaining = 0;
		// both pre-advanced to the same next-needed char 'x'; long words so the
		// completion does not fire and clear the lock
		const near = createEnemy(getArchetype("husk-1"), 1, { x: 10, y: 0 }, 0, [
			"zxy",
		]);
		const far = createEnemy(getArchetype("husk-1"), 2, { x: 20, y: 0 }, 0, [
			"qxy",
		]);
		near.typedCount = 1;
		far.typedCount = 1;
		s.enemies = [near, far];
		s.nextEnemyId = 3;
		s = step(s, [{ type: "key", key: "x" }]);
		expect(s.targetId).toBe(1); // nearest to the core wins
		expect(s.enemies.find((e) => e.id === 1)?.typedCount).toBe(2);
		expect(s.enemies.find((e) => e.id === 2)?.typedCount).toBe(1);
	});

	it("backspace releases the lock, keeps progress, and is never a miss", () => {
		let s = createInitialState(1);
		s.wavePhase = "active";
		s.spawnQueueRemaining = 0;
		s.enemies = [
			createEnemy(getArchetype("husk-1"), 1, { x: 12, y: 0 }, 0, ["alpha"]),
		];
		s.nextEnemyId = 2;
		s = step(s, [{ type: "key", key: "a" }]);
		s = step(s, [{ type: "key", key: "l" }]); // typedCount 2
		const missesBefore = s.misses;
		s = step(s, [{ type: "backspace" }]);
		expect(s.targetId).toBeNull();
		expect(s.misses).toBe(missesBefore); // release is never a miss
		expect(s.enemies.find((e) => e.id === 1)?.typedCount).toBe(2); // progress kept
	});

	it("free-flow: a dead key that matches no live target counts a miss", () => {
		let s = createInitialState(1);
		s.wavePhase = "active";
		s.spawnQueueRemaining = 0;
		s.enemies = [
			createEnemy(getArchetype("husk-1"), 1, { x: 12, y: 0 }, 0, ["alpha"]),
		];
		s.nextEnemyId = 2;
		s.combo = 5;
		s.comboTicksLeft = 100;
		s = step(s, [{ type: "key", key: "z" }]); // matches nothing on the field
		expect(s.misses).toBe(1);
		expect(s.combo).toBe(0);
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
