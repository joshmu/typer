import { describe, expect, it } from "vitest";
import { tickAbility } from "./abilities";
import { createRngState } from "./rng";
import {
	ALIVE_HARD_CAP,
	MAX_ALIVE,
	runWaveDirector,
	selectArchetypeId,
	spawnFromArchetype,
	waveEnemyCount,
	waveSpawnCooldown,
} from "./spawner";
import {
	createInitialState,
	currentWord,
	type EnemyState,
	type GameState,
	type PowerupPickup,
} from "./state";

function powerup(word: string): PowerupPickup {
	return {
		id: 1,
		kind: "freeze",
		word,
		typedCount: 0,
		pos: { x: 0, y: 0 },
		expiresTick: 9999,
	};
}

function drive(s: GameState, ticks: number): GameState {
	let cur = s;
	for (let i = 0; i < ticks; i++) {
		cur = { ...cur, tick: cur.tick + 1 };
		runWaveDirector(cur);
	}
	return cur;
}

describe("spawner", () => {
	it("wave enemy count escalates", () => {
		expect(waveEnemyCount(1)).toBeLessThan(waveEnemyCount(5));
		expect(waveEnemyCount(1)).toBeGreaterThan(0);
	});

	it("selectArchetypeId is deterministic and returns a roster id", async () => {
		const ids = new Set(
			(await import("../content/enemies")).ENEMIES.map((e) => e.id),
		);
		const [a, na] = selectArchetypeId(1, createRngState(3));
		const [b, nb] = selectArchetypeId(1, createRngState(3));
		expect(a).toBe(b);
		expect(na).toBe(nb);
		expect(ids.has(a)).toBe(true);
	});

	it("early waves only field tier-1 regulars", async () => {
		const roster = new Map(
			(await import("../content/enemies")).ENEMIES.map((e) => [e.id, e]),
		);
		let s = createRngState(11);
		for (let i = 0; i < 40; i++) {
			const [id, n] = selectArchetypeId(1, s);
			const arch = roster.get(id);
			expect(arch?.tier).toBe(1);
			expect(arch?.role).toBe("regular");
			s = n;
		}
	});

	it("later waves can field higher-tier regulars", async () => {
		const roster = new Map(
			(await import("../content/enemies")).ENEMIES.map((e) => [e.id, e]),
		);
		let s = createRngState(11);
		let sawHigher = false;
		for (let i = 0; i < 200; i++) {
			const [id, n] = selectArchetypeId(12, s);
			if ((roster.get(id)?.tier ?? 1) > 1) sawHigher = true;
			s = n;
		}
		expect(sawHigher).toBe(true);
	});

	it("boss waves field a boss on the wave's FIRST spawn only", async () => {
		const roster = new Map(
			(await import("../content/enemies")).ENEMIES.map((e) => [e.id, e]),
		);
		// first spawn of a 5th wave: always a boss
		const [first] = selectArchetypeId(10, createRngState(11), true);
		expect(roster.get(first)?.role).toBe("boss");
		// every later spawn of the same wave: never a boss (a single wave must not
		// stack multiple bosses)
		let s = createRngState(11);
		for (let i = 0; i < 200; i++) {
			const [id, n] = selectArchetypeId(10, s);
			expect(roster.get(id)?.role).toBe("regular");
			s = n;
		}
	});

	it("spawnFromArchetype places one enemy on the spawn radius", () => {
		const s = createInitialState(1);
		spawnFromArchetype(s, "husk-1", { x: 20, y: 0 });
		expect(s.enemies.length).toBe(1);
		expect(s.enemies[0].alive).toBe(true);
		expect(s.nextEnemyId).toBe(2);
	});

	it("starts wave 1 after the initial intermission", () => {
		const s = drive(createInitialState(42), 61);
		expect(s.wave).toBe(1);
		expect(s.wavePhase).toBe("active");
	});

	it("spawnFromArchetype no-ops and returns false at the alive hard cap", () => {
		const s = createInitialState(1);
		for (let i = 0; i < ALIVE_HARD_CAP; i++) {
			spawnFromArchetype(s, "husk-1", { x: 20, y: 0 });
		}
		expect(s.enemies.filter((e) => e.alive).length).toBe(ALIVE_HARD_CAP);
		const before = s.enemies.length;
		const spawned = spawnFromArchetype(s, "husk-1", { x: 20, y: 0 });
		expect(spawned).toBe(false);
		expect(s.enemies.length).toBe(before);
	});

	it("ability spawns emit nothing once the alive hard cap is reached", () => {
		const s = createInitialState(1);
		for (let i = 0; i < ALIVE_HARD_CAP; i++) {
			spawnFromArchetype(s, "husk-1", { x: 20, y: 0 });
		}
		const spawner: EnemyState = {
			...s.enemies[0],
			id: 999,
			archetypeId: "brood-2",
			ability: { kind: "spawn", minion: "brood-1", rate: 10 },
			spawnTick: 0,
			pos: { x: 5, y: 0 },
		};
		s.enemies = [...s.enemies, spawner];
		const before = s.enemies.length;
		s.tick = 10; // age % rate === 0 → would emit if not capped
		tickAbility(s, spawner);
		expect(s.enemies.length).toBe(before);
	});

	it("an enemy spawned while a powerup is active never shares its initial", () => {
		const s = createInitialState(3);
		s.powerups = [powerup("volt")];
		for (let i = 0; i < 8; i++) {
			spawnFromArchetype(s, "husk-1", { x: 20, y: 0 });
		}
		expect(s.enemies.length).toBe(8);
		for (const e of s.enemies) {
			expect(currentWord(e)[0]).not.toBe("v");
		}
	});

	it("does not flip to intermission on the tick it spawns the last queued enemy", () => {
		const s = createInitialState(42);
		s.wavePhase = "active";
		s.wave = 1;
		s.spawnQueueRemaining = 1;
		s.spawnCooldown = 0;
		s.enemies = [];
		s.tick = 100;
		runWaveDirector(s);
		// the last queued enemy was just spawned into an empty field — the wave
		// must stay active, not complete off a stale (pre-spawn) alive count.
		expect(s.enemies.filter((e) => e.alive).length).toBe(1);
		expect(s.wavePhase).toBe("active");
	});

	it("waveSpawnCooldown grants wave-1 grace and floors at 30", () => {
		expect(waveSpawnCooldown(1)).toBe(90);
		expect(waveSpawnCooldown(2)).toBe(80);
		expect(waveSpawnCooldown(7)).toBe(30);
		expect(waveSpawnCooldown(12)).toBe(30);
		// never rises as waves climb, never dips below the floor
		for (let w = 1; w < 20; w++) {
			expect(waveSpawnCooldown(w + 1)).toBeLessThanOrEqual(
				waveSpawnCooldown(w),
			);
			expect(waveSpawnCooldown(w)).toBeGreaterThanOrEqual(30);
		}
	});

	it("the wave director paces spawns by waveSpawnCooldown(wave)", () => {
		const s = createInitialState(42);
		s.wavePhase = "active";
		s.wave = 1;
		s.spawnQueueRemaining = 3;
		s.spawnCooldown = 0;
		s.enemies = [];
		s.tick = 100;
		runWaveDirector(s);
		expect(s.spawnCooldown).toBe(waveSpawnCooldown(1));
	});

	it("spawns up to the wave count and never exceeds MAX_ALIVE", () => {
		const s = drive(createInitialState(42), 60 * 60);
		expect(s.enemies.filter((e) => e.alive).length).toBeLessThanOrEqual(
			MAX_ALIVE,
		);
		expect(s.enemies.length).toBeGreaterThan(0);
	});
});

/** Advance a crafted intermission state so the wave increments by exactly one. */
function incrementWave(s: GameState): void {
	s.wavePhase = "intermission";
	s.intermissionTicksLeft = 0;
	runWaveDirector(s);
}

/**
 * Find a seed whose first eligible wave (wave 4) rolls a swarm, and return the
 * state at the moment that wave went active. The 20% roll fires for ~1 in 5
 * seeds so a small search space suffices.
 */
function craftSwarmWave(): GameState {
	for (let seed = 0; seed < 5000; seed++) {
		const s = createInitialState(seed);
		s.wave = 3;
		s.lastSwarmWave = 0;
		incrementWave(s);
		if (s.waveKind === "swarm") return s;
	}
	throw new Error("no swarm seed found in search space");
}

describe("frenzy swarm waves", () => {
	it("initialises waveKind normal and lastSwarmWave 0", () => {
		const s = createInitialState(1);
		expect(s.waveKind).toBe("normal");
		expect(s.lastSwarmWave).toBe(0);
	});

	it("every 5th wave is a boss wave", () => {
		const s = createInitialState(1);
		s.wave = 4;
		incrementWave(s);
		expect(s.wave).toBe(5);
		expect(s.waveKind).toBe("boss");
	});

	it("waves 1-3 are never swarm, regardless of seed", () => {
		for (let seed = 0; seed < 200; seed++) {
			for (const target of [1, 2, 3]) {
				const s = createInitialState(seed);
				s.wave = target - 1;
				incrementWave(s);
				expect(s.wave).toBe(target);
				expect(s.waveKind).not.toBe("swarm");
			}
		}
	});

	it("some seed turns a wave >3 into a swarm", () => {
		let found = false;
		for (let seed = 0; seed < 5000 && !found; seed++) {
			const s = createInitialState(seed);
			s.wave = 3;
			s.lastSwarmWave = 0;
			incrementWave(s);
			if (s.wave === 4 && s.waveKind === "swarm") found = true;
		}
		expect(found).toBe(true);
	});

	it("never rolls a swarm the wave immediately after a swarm", () => {
		// lastSwarmWave = new wave - 1 must skip the roll for every seed, even the
		// ones that would otherwise have rolled a swarm.
		for (let seed = 0; seed < 400; seed++) {
			const s = createInitialState(seed);
			s.wave = 3;
			s.lastSwarmWave = 3; // target wave 4 immediately follows a swarm → roll skipped
			incrementWave(s);
			expect(s.wave).toBe(4);
			expect(s.waveKind).not.toBe("swarm");
		}
	});

	it("a swarm wave queues 4x the normal enemy count", () => {
		const s = craftSwarmWave();
		expect(s.wave).toBe(4);
		expect(s.lastSwarmWave).toBe(4);
		expect(s.spawnQueueRemaining).toBe(waveEnemyCount(4) * 4);
	});

	it("a swarm wave fields only tier-1 smalls with unique single-letter words", () => {
		const s = craftSwarmWave();
		for (let i = 0; i < 800; i++) {
			s.tick += 1;
			runWaveDirector(s);
		}
		const alive = s.enemies.filter((e) => e.alive);
		expect(alive.length).toBeGreaterThan(0);
		for (const e of alive) {
			expect(["husk-1", "darter-1"]).toContain(e.archetypeId);
			expect(currentWord(e)).toMatch(/^[a-z]$/);
			expect(e.hp).toBe(1);
			expect(e.words.length).toBe(1);
		}
		const initials = alive.map((e) => currentWord(e)[0]);
		expect(new Set(initials).size).toBe(initials.length);
	});

	it("swarm soft cap lets the live field exceed MAX_ALIVE (up to 12)", () => {
		const s = createInitialState(1);
		s.wave = 4;
		s.waveKind = "swarm";
		s.wavePhase = "active";
		s.spawnQueueRemaining = 100;
		s.spawnCooldown = 0;
		for (let i = 0; i < 3000; i++) {
			s.tick += 1;
			runWaveDirector(s);
		}
		const alive = s.enemies.filter((e) => e.alive).length;
		expect(alive).toBeGreaterThan(MAX_ALIVE);
		expect(alive).toBeLessThanOrEqual(12);
	});

	it("swarm spawning continues at 9 alive but stops at the soft cap of 12", () => {
		const nine = createInitialState(1);
		nine.wave = 4;
		nine.waveKind = "swarm";
		nine.wavePhase = "active";
		nine.spawnQueueRemaining = 20;
		nine.spawnCooldown = 0;
		for (let i = 0; i < 9; i++) {
			spawnFromArchetype(nine, "husk-1", { x: 20, y: 0 }, true);
		}
		expect(nine.enemies.filter((e) => e.alive).length).toBe(9);
		const q = nine.spawnQueueRemaining;
		nine.tick += 1;
		runWaveDirector(nine);
		expect(nine.spawnQueueRemaining).toBe(q - 1);
		expect(nine.enemies.filter((e) => e.alive).length).toBe(10);

		const twelve = createInitialState(1);
		twelve.wave = 4;
		twelve.waveKind = "swarm";
		twelve.wavePhase = "active";
		twelve.spawnQueueRemaining = 20;
		twelve.spawnCooldown = 0;
		for (let i = 0; i < 12; i++) {
			spawnFromArchetype(twelve, "husk-1", { x: 20, y: 0 }, true);
		}
		expect(twelve.enemies.filter((e) => e.alive).length).toBe(12);
		const q2 = twelve.spawnQueueRemaining;
		twelve.tick += 1;
		runWaveDirector(twelve);
		expect(twelve.spawnQueueRemaining).toBe(q2);
		expect(twelve.enemies.filter((e) => e.alive).length).toBe(12);
	});

	it("swarm spawn cooldown is a third of the normal cadence, floored at 10", () => {
		const s = createInitialState(1);
		s.wave = 4;
		s.waveKind = "swarm";
		s.wavePhase = "active";
		s.spawnQueueRemaining = 20;
		s.spawnCooldown = 0;
		s.tick = 100;
		runWaveDirector(s);
		expect(s.spawnCooldown).toBe(
			Math.max(10, Math.floor(waveSpawnCooldown(4) / 3)),
		);
	});

	it("both forced swarm archetypes are hp 1 (single-letter chain invariant)", async () => {
		const { getArchetype } = await import("../content/enemies");
		expect(getArchetype("husk-1").hp).toBe(1);
		expect(getArchetype("darter-1").hp).toBe(1);
	});
});

describe("boss sentence chains", () => {
	it("spawns a boss with a sentence chain where words.length === hp === maxHp", async () => {
		const { BOSS_TEXTS } = await import("../content/boss-texts");
		const s = createInitialState(7);
		spawnFromArchetype(s, "boss-maw", { x: 20, y: 0 });
		const boss = s.enemies[0];
		// chain is a full passage — far longer than the archetype's nominal hp (5)
		expect(boss.words.length).toBeGreaterThanOrEqual(15);
		expect(boss.hp).toBe(boss.words.length);
		expect(boss.maxHp).toBe(boss.words.length);
		// and it is verbatim one of the authored passages, in order
		expect(BOSS_TEXTS).toContainEqual(boss.words);
	});

	it("overrides the archetype hp — chain length wins over enemies.ts hp", async () => {
		const { getArchetype } = await import("../content/enemies");
		const nominal = getArchetype("boss-iron").hp; // 5
		const s = createInitialState(11);
		spawnFromArchetype(s, "boss-iron", { x: 20, y: 0 });
		const boss = s.enemies[0];
		expect(boss.hp).not.toBe(nominal);
		expect(boss.hp).toBe(boss.words.length);
	});

	it("picks a passage whose first initial avoids a crafted live initial", async () => {
		const { BOSS_TEXTS } = await import("../content/boss-texts");
		// craft a live enemy on the field whose initial matches SOME passage's first
		// letter; the boss chain drawn next must not start with that letter (a
		// survivor exists, so the filter must dodge it).
		const collidingInitial = BOSS_TEXTS[0][0][0];
		for (let seed = 0; seed < 30; seed++) {
			const s = createInitialState(seed);
			// a regular already alive whose current word starts with the boss's would-be initial
			spawnFromArchetype(s, "husk-1", { x: 20, y: 0 });
			const decoy = s.enemies[0];
			decoy.words = [`${collidingInitial}decoyword`];
			spawnFromArchetype(s, "boss-hive", { x: -20, y: 0 });
			const boss = s.enemies[1];
			expect(boss.words[0][0]).not.toBe(collidingInitial);
		}
	});

	it("wave 5 fields a boss whose chain equals its hp", async () => {
		const { getArchetype } = await import("../content/enemies");
		const s = createInitialState(42);
		s.wavePhase = "active";
		s.waveKind = "boss";
		s.wave = 5;
		s.spawnQueueRemaining = waveEnemyCount(5);
		s.spawnCooldown = 0;
		s.enemies = [];
		s.tick = 100;
		runWaveDirector(s);
		const boss = s.enemies.find(
			(e) => getArchetype(e.archetypeId).role === "boss",
		);
		expect(boss).toBeDefined();
		if (boss) {
			expect(boss.words.length).toBeGreaterThanOrEqual(15);
			expect(boss.hp).toBe(boss.words.length);
		}
	});
});

describe("perk draft (wave director)", () => {
	it("a cleared wave enters perk-choice and draws a 3-distinct offer", () => {
		const s = createInitialState(42);
		s.wavePhase = "active";
		s.wave = 1;
		s.spawnQueueRemaining = 0;
		s.enemies = [];
		s.tick = 200;
		runWaveDirector(s);
		expect(s.wavePhase).toBe("perk-choice");
		expect(s.perkOffer?.length).toBe(3);
		expect(new Set(s.perkOffer).size).toBe(3);
	});

	it("perk-choice freezes the director — no spawn, no cooldown decay, no advance", () => {
		const s = createInitialState(42);
		s.wavePhase = "perk-choice";
		s.perkOffer = ["plating", "greed", "sharpshooter"];
		s.spawnQueueRemaining = 5;
		s.spawnCooldown = 5;
		s.tick = 300;
		runWaveDirector(s);
		expect(s.enemies.length).toBe(0);
		expect(s.spawnCooldown).toBe(5);
		expect(s.wavePhase).toBe("perk-choice");
	});

	it("the initial wave 0→1 intermission never offers a perk", () => {
		const s = drive(createInitialState(42), 61);
		expect(s.wave).toBe(1);
		expect(s.wavePhase).toBe("active");
		expect(s.perkOffer).toBeNull();
		expect(s.perks).toEqual([]);
	});
});
