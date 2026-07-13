import { describe, expect, it } from "vitest";
import { getArchetype } from "../content/enemies";
import { createEnemy } from "./enemy-factory";
import { INTERMISSION_TICKS, MAX_ALIVE, spawnFromArchetype } from "./spawner";
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
		movePhase: 0,
		phaseTick: 0,
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

/** Craft a state that clears its wave on the next step (empty field, no queue),
 * dropping the sim into perk-choice with a fresh 3-card offer. */
function clearedToPerkChoice(seed: number): GameState {
	let s = createInitialState(seed);
	s.wavePhase = "active";
	s.wave = 1;
	s.spawnQueueRemaining = 0;
	s.enemies = [];
	s = step(s, []);
	return s;
}

/** An active wave with a single distant, slow decoy so misses register but the
 * wave never clears (and the decoy never reaches the core within the test). */
function activeWithDecoy(perks: GameState["perks"] = []): GameState {
	const s = createInitialState(1);
	s.wavePhase = "active";
	s.spawnQueueRemaining = 0;
	s.perks = perks;
	s.enemies = [
		createEnemy(getArchetype("husk-1"), 1, { x: 30, y: 0 }, 0, ["queen"]),
	];
	s.nextEnemyId = 2;
	return s;
}

describe("perk draft (step)", () => {
	it("a wave clear drops the sim into perk-choice with a 3-card offer", () => {
		const s = clearedToPerkChoice(42);
		expect(s.wavePhase).toBe("perk-choice");
		expect(s.perkOffer?.length).toBe(3);
	});

	it("picking a perk owns it and flips to a normal intermission", () => {
		let s = clearedToPerkChoice(42);
		const chosen = s.perkOffer?.[0];
		s = step(s, [{ type: "perk", index: 0 }]);
		expect(chosen).toBeDefined();
		expect(s.perks).toContain(chosen);
		expect(s.perkOffer).toBeNull();
		expect(s.wavePhase).toBe("intermission");
		expect(s.intermissionTicksLeft).toBe(INTERMISSION_TICKS);
		expect(s.steadyHandsUsedThisWave).toBe(false);
	});

	it("ignores an out-of-range perk index (stays choosing)", () => {
		let s = clearedToPerkChoice(42);
		s = step(s, [{ type: "perk", index: 9 }]);
		expect(s.wavePhase).toBe("perk-choice");
		expect(s.perkOffer).not.toBeNull();
		expect(s.perks).toEqual([]);
	});

	it("a perk event with no offer pending is inert", () => {
		let s = createInitialState(1);
		expect(s.perkOffer).toBeNull();
		s = step(s, [{ type: "perk", index: 0 }]);
		expect(s.perks).toEqual([]);
	});

	it("keys during perk-choice never miss and never route", () => {
		let s = clearedToPerkChoice(42);
		const missBefore = s.misses;
		s = step(s, [{ type: "key", key: "z" }]);
		expect(s.misses).toBe(missBefore);
		expect(s.wavePhase).toBe("perk-choice");
		expect(s.perkOffer).not.toBeNull();
	});

	it("plating raises max hp and heals on pick", () => {
		let s = clearedToPerkChoice(42);
		s.perkOffer = ["plating", "greed", "sharpshooter"];
		const maxBefore = s.maxPlayerHp;
		const hpBefore = s.playerHp;
		s = step(s, [{ type: "perk", index: 0 }]);
		expect(s.perks).toContain("plating");
		expect(s.maxPlayerHp).toBe(maxBefore + 1);
		expect(s.playerHp).toBe(hpBefore + 1);
	});
});

describe("perk effects (step)", () => {
	it("steady-hands spares the combo on the first miss each wave, then breaks", () => {
		let s = activeWithDecoy(["steady-hands"]);
		s.combo = 7;
		s.comboTicksLeft = 100;
		s = step(s, [{ type: "key", key: "z" }]); // 'z' matches nothing → miss
		expect(s.misses).toBe(1);
		expect(s.combo).toBe(7); // spared
		expect(s.steadyHandsUsedThisWave).toBe(true);
		s = step(s, [{ type: "key", key: "z" }]); // second miss breaks it
		expect(s.combo).toBe(0);
	});

	it("a miss resets the overclock streak", () => {
		let s = activeWithDecoy(["overclock"]);
		s.overclockStreak = 12;
		s = step(s, [{ type: "key", key: "z" }]);
		expect(s.overclockStreak).toBe(0);
	});

	it("gravity-well slows an enemy within 8 of the core", () => {
		function closed(perks: GameState["perks"]): number {
			let s = createInitialState(1);
			s.wavePhase = "active";
			s.spawnQueueRemaining = 0;
			s.perks = perks;
			const e = createEnemy(getArchetype("husk-1"), 1, { x: 7, y: 0 }, 0, [
				"queen",
			]);
			s.enemies = [e];
			s.nextEnemyId = 2;
			const before = Math.hypot(e.pos.x, e.pos.y);
			for (let i = 0; i < 120; i++) s = step(s, []);
			const now = s.enemies.find((x) => x.id === 1);
			if (!now) throw new Error("enemy gone");
			return before - Math.hypot(now.pos.x, now.pos.y);
		}
		expect(closed(["gravity-well"])).toBeLessThan(closed([]));
	});

	it("gravity-well does NOT slow an enemy outside 8 of the core", () => {
		function closed(perks: GameState["perks"]): number {
			let s = createInitialState(1);
			s.wavePhase = "active";
			s.spawnQueueRemaining = 0;
			s.perks = perks;
			// start well outside the 8-unit well and only drive a short window so it
			// never crosses inside — the well must not touch it here
			const e = createEnemy(getArchetype("husk-1"), 1, { x: 40, y: 0 }, 0, [
				"queen",
			]);
			s.enemies = [e];
			s.nextEnemyId = 2;
			const before = Math.hypot(e.pos.x, e.pos.y);
			for (let i = 0; i < 60; i++) s = step(s, []);
			const now = s.enemies.find((x) => x.id === 1);
			if (!now) throw new Error("enemy gone");
			return before - Math.hypot(now.pos.x, now.pos.y);
		}
		expect(closed(["gravity-well"])).toBeCloseTo(closed([]), 9);
	});

	it("vampiric heals 1 hp at each 15-kill milestone, capped at max", () => {
		let s = activeWithDecoy(["vampiric"]);
		s.playerHp = 1;
		s.maxPlayerHp = 3;
		s.kills = 15;
		s.lastVampiricMilestone = 0;
		s = step(s, []);
		expect(s.playerHp).toBe(2);
		expect(s.lastVampiricMilestone).toBe(1);
		// at full hp the heal is capped away, but the milestone still advances
		s.playerHp = 3;
		s.kills = 30;
		s = step(s, []);
		expect(s.playerHp).toBe(3);
		expect(s.lastVampiricMilestone).toBe(2);
	});

	it("scavenger drops a powerup at 9 kills instead of 12", () => {
		let s = createInitialState(1);
		s.perks = ["scavenger"];
		s.kills = 9;
		s = step(s, []);
		expect(s.powerups.length).toBe(1);
	});

	it("adrenaline widens the combo decay window on a kill", () => {
		let s = createInitialState(1);
		s.wavePhase = "active";
		s.spawnQueueRemaining = 0;
		s.perks = ["adrenaline"];
		s.enemies = [
			createEnemy(getArchetype("husk-1"), 1, { x: 8, y: 0 }, 0, ["a"]),
		];
		s.nextEnemyId = 2;
		s = step(s, [{ type: "key", key: "a" }]);
		expect(s.kills).toBe(1);
		expect(s.comboTicksLeft).toBe(Math.floor(180 * 1.5));
	});

	it("overclock streak builds on consecutive hits and resets when consumed", () => {
		// 20 hits on a long-worded enemy, then the completion consumes the prime
		let s = createInitialState(1);
		s.wavePhase = "active";
		s.spawnQueueRemaining = 0;
		s.perks = ["overclock"];
		const word = "abcdefghijklmnopqrst"; // 20 chars → 20 hits to complete
		s.enemies = [
			createEnemy(getArchetype("husk-1"), 1, { x: 8, y: 0 }, 0, [word]),
		];
		s.nextEnemyId = 2;
		for (let i = 0; i < word.length; i++) {
			s = step(s, [{ type: "key", key: word[i] }]);
		}
		expect(s.kills).toBe(1); // the 20th hit completed & killed it
		expect(s.overclockStreak).toBe(0); // prime consumed on that completion
	});
});
