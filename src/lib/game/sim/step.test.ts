import { describe, expect, it } from "vitest";
import { createRngState } from "./rng";
import { ARENA, createInitialState, type GameState } from "./state";
import {
	type GameEvent,
	MAX_ALIVE,
	SPAWN_INTERVAL_TICKS,
	spawnPoint,
	step,
} from "./step";

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

describe("step", () => {
	it("spawns an enemy on the spawn interval", () => {
		const s = run(createInitialState(42), SPAWN_INTERVAL_TICKS + 1);
		expect(s.enemies.filter((e) => e.alive).length).toBeGreaterThanOrEqual(1);
	});

	it("samples spawn points exactly on the spawn radius", () => {
		for (let seed = 0; seed < 8; seed++) {
			const [pos] = spawnPoint(createRngState(seed), ARENA.spawnRadius);
			const d = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
			expect(Math.abs(d - ARENA.spawnRadius)).toBeLessThan(1e-9);
		}
	});

	it("caps alive enemies at MAX_ALIVE", () => {
		const s = run(createInitialState(42), SPAWN_INTERVAL_TICKS * 30);
		expect(s.enemies.filter((e) => e.alive).length).toBeLessThanOrEqual(
			MAX_ALIVE,
		);
	});

	it("enemies move toward the player", () => {
		const a = run(createInitialState(42), SPAWN_INTERVAL_TICKS + 1);
		const b = step(a, []);
		const ea = a.enemies[0];
		const eb = b.enemies[0];
		expect(Math.hypot(eb.pos.x, eb.pos.y)).toBeLessThan(
			Math.hypot(ea.pos.x, ea.pos.y),
		);
	});

	it("typing the full word kills the target", () => {
		let s = run(createInitialState(42), SPAWN_INTERVAL_TICKS + 1);
		const word = s.enemies[0].word;
		for (const ch of word) {
			s = step(s, [{ type: "key", key: ch }]);
		}
		expect(s.kills).toBe(1);
		expect(s.enemies[0].alive).toBe(false);
		expect(s.targetId).toBeNull();
		expect(s.score).toBe(10 * word.length);
	});

	it("counts a miss without breaking the lock", () => {
		let s = run(createInitialState(42), SPAWN_INTERVAL_TICKS + 1);
		const word = s.enemies[0].word;
		s = step(s, [{ type: "key", key: word[0] }]);
		const locked = s.targetId;
		s = step(s, [{ type: "key", key: "¤" }]);
		expect(s.misses).toBe(1);
		expect(s.targetId).toBe(locked);
	});

	it("enemy reaching player costs hp and eventually ends the game", () => {
		const s = run(createInitialState(42), 60 * 60 * 5); // 5 sim minutes untyped
		expect(s.playerHp).toBe(0);
		expect(s.status).toBe("gameover");
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
