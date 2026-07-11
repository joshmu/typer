import { describe, expect, it } from "vitest";
import { MAX_ALIVE } from "./spawner";
import { createInitialState, type GameState } from "./state";
import { type GameEvent, step } from "./step";

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

	it("is pure — same inputs, same output, no input mutation", () => {
		const s0 = createInitialState(7);
		const frozen = JSON.stringify(s0);
		const a = step(s0, []);
		const b = step(s0, []);
		expect(JSON.stringify(s0)).toBe(frozen);
		expect(a).toEqual(b);
	});
});
