import { describe, expect, it } from "vitest";
import { getArchetype } from "../content/enemies";
import { createEnemy } from "./enemy-factory";
import type { SimEvent } from "./events";
import type { PerkId } from "./perks";
import { POWERUP_LIFETIME_TICKS } from "./powerups";
import { stateHash } from "./replay";
import {
	ARENA,
	createInitialState,
	type GameState,
	type PowerupKind,
} from "./state";
import { step } from "./step";

function enemy(archetypeId: string, id: number, x: number, words: string[]) {
	return createEnemy(getArchetype(archetypeId), id, { x, y: 0 }, 0, words);
}

/** An active wave with no pending spawns, so only the placed enemies act. */
function field(
	perks: PerkId[],
	enemies: ReturnType<typeof enemy>[],
): GameState {
	const s = createInitialState(42);
	s.wave = 1;
	s.wavePhase = "active";
	s.spawnQueueRemaining = 0;
	s.perks = perks;
	s.enemies = enemies;
	s.nextEnemyId = enemies.length + 1;
	return s;
}

function press(s: GameState, key: string): SimEvent[] {
	const out: SimEvent[] = [];
	step(s, [{ type: "key", key }], out);
	return out;
}

describe("sim events", () => {
	it("a typed kill reports cause typed; a splash kill reports cause weapon", () => {
		const s = field(
			["splash-rounds"],
			[enemy("husk-1", 1, 5, ["a"]), enemy("husk-1", 2, 8, ["b"])],
		);
		const out = press(s, "a");
		expect(out).toContainEqual(
			expect.objectContaining({ type: "kill", id: 1, cause: "typed" }),
		);
		expect(out).toContainEqual(
			expect.objectContaining({ type: "kill", id: 2, cause: "weapon" }),
		);
		// the splash victim was never typed at
		expect(out.filter((e) => e.type === "hit" && e.id === 2)).toEqual([]);
	});

	it("a splash absorb reports the absorbing enemy, not the locked target", () => {
		const s = field(
			["splash-rounds"],
			[enemy("husk-1", 1, 5, ["a"]), enemy("weaver-1", 2, 8, ["b"])],
		);
		const out = press(s, "a");
		expect(out).toContainEqual(
			expect.objectContaining({ type: "absorb", id: 2, typed: false }),
		);
	});

	it("a typed completion that clangs off a shield reports a typed absorb", () => {
		const s = field([], [enemy("weaver-1", 1, 8, ["a"])]);
		expect(press(s, "a")).toEqual([
			expect.objectContaining({ type: "absorb", id: 1, typed: true }),
		]);
	});

	it("a keystroke that does not finish the word reports an undamaging typed hit", () => {
		const s = field([], [enemy("husk-1", 1, 8, ["ab"])]);
		expect(press(s, "a")).toEqual([
			expect.objectContaining({
				type: "hit",
				id: 1,
				typed: true,
				damaged: false,
			}),
		]);
	});

	it("a chip on a multi-hp enemy reports a damaging typed hit", () => {
		const s = field([], [enemy("husk-4", 1, 8, ["a", "b", "c"])]);
		expect(press(s, "a")).toEqual([
			expect.objectContaining({
				type: "hit",
				id: 1,
				typed: true,
				damaged: true,
			}),
		]);
	});

	it("an enemy reaching the core reports a breach", () => {
		const s = field([], [enemy("husk-1", 1, ARENA.killRadius, ["a"])]);
		const out: SimEvent[] = [];
		step(s, [], out);
		expect(out).toEqual([expect.objectContaining({ type: "breach", id: 1 })]);
	});

	it("a completed bomb pickup reports the powerup and bomb kills", () => {
		const s = field([], [enemy("husk-1", 1, 20, ["the"])]);
		s.powerups = [
			{
				id: 1,
				kind: "bomb",
				word: "z",
				typedCount: 0,
				pos: { x: 10, y: 0 },
				expiresTick: POWERUP_LIFETIME_TICKS,
			},
		];
		const out = press(s, "z");
		expect(out).toContainEqual({ type: "powerup", kind: "bomb" });
		expect(out).toContainEqual(
			expect.objectContaining({ type: "kill", id: 1, cause: "bomb" }),
		);
	});

	it.each<PowerupKind>(["freeze", "bomb", "heal", "slow"])(
		"a completed %s pickup reports a powerup event",
		(kind) => {
			const s = field([], [enemy("husk-1", 1, 20, ["the"])]);
			s.powerups = [
				{
					id: 1,
					kind,
					word: "z",
					typedCount: 0,
					pos: { x: 10, y: 0 },
					expiresTick: POWERUP_LIFETIME_TICKS,
				},
			];
			expect(press(s, "z")).toContainEqual({ type: "powerup", kind });
		},
	);

	it("collecting events leaves the state hash unchanged", () => {
		const s = field(
			["splash-rounds"],
			[enemy("husk-1", 1, 5, ["a"]), enemy("weaver-1", 2, 8, ["b"])],
		);
		const key = [{ type: "key" as const, key: "a" }];
		expect(stateHash(step(s, key, []))).toBe(stateHash(step(s, key)));
	});
});
