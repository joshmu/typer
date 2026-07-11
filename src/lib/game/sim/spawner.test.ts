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
} from "./spawner";
import { createInitialState, type EnemyState, type GameState } from "./state";

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

	it("boss waves can field a boss", async () => {
		const roster = new Map(
			(await import("../content/enemies")).ENEMIES.map((e) => [e.id, e]),
		);
		let s = createRngState(11);
		let sawBoss = false;
		for (let i = 0; i < 200; i++) {
			const [id, n] = selectArchetypeId(10, s);
			if (roster.get(id)?.role === "boss") sawBoss = true;
			s = n;
		}
		expect(sawBoss).toBe(true);
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

	it("spawns up to the wave count and never exceeds MAX_ALIVE", () => {
		const s = drive(createInitialState(42), 60 * 60);
		expect(s.enemies.filter((e) => e.alive).length).toBeLessThanOrEqual(
			MAX_ALIVE,
		);
		expect(s.enemies.length).toBeGreaterThan(0);
	});
});
