import { describe, expect, it } from "vitest";
import { createRngState } from "./rng";
import {
	MAX_ALIVE,
	runWaveDirector,
	selectArchetypeId,
	spawnFromArchetype,
	waveEnemyCount,
} from "./spawner";
import { createInitialState, type GameState } from "./state";

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

	it("selectArchetypeId is deterministic and returns a known id", () => {
		const [a] = selectArchetypeId(1, createRngState(3));
		const [b] = selectArchetypeId(1, createRngState(3));
		expect(a).toBe(b);
		expect(a).toBe("husk-1");
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

	it("spawns up to the wave count and never exceeds MAX_ALIVE", () => {
		const s = drive(createInitialState(42), 60 * 60);
		expect(s.enemies.filter((e) => e.alive).length).toBeLessThanOrEqual(
			MAX_ALIVE,
		);
		expect(s.enemies.length).toBeGreaterThan(0);
	});
});
