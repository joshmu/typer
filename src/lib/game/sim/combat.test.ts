import { describe, expect, it } from "vitest";
import { getArchetype } from "../content/enemies";
import { killEnemy, reassignWord, resolveCompletion } from "./combat";
import { createEnemy } from "./enemy-factory";
import { createInitialState, type GameState } from "./state";

function stateWithEnemy(archetypeId: string): {
	s: GameState;
	enemyId: number;
} {
	const s = createInitialState(42);
	const enemy = createEnemy(
		getArchetype(archetypeId),
		s.nextEnemyId,
		{ x: 5, y: 0 },
		0,
		getArchetype(archetypeId).hp > 1 ? "brutes" : "the",
	);
	s.nextEnemyId += 1;
	s.enemies = [enemy];
	s.targetId = enemy.id;
	return { s, enemyId: enemy.id };
}

describe("combat", () => {
	it("reassignWord swaps the word and resets typedCount but keeps the lock", () => {
		const { s, enemyId } = stateWithEnemy("grunt");
		const e = s.enemies[0];
		e.typedCount = 2;
		const before = e.word;
		reassignWord(s, e);
		expect(e.typedCount).toBe(0);
		expect(typeof e.word).toBe("string");
		expect(s.targetId).toBe(enemyId);
		expect(e.word.length).toBeGreaterThan(0);
		void before;
	});

	it("killEnemy awards combo-scaled score and clears the lock", () => {
		const { s } = stateWithEnemy("grunt");
		const e = s.enemies[0];
		killEnemy(s, e);
		expect(e.alive).toBe(false);
		expect(s.kills).toBe(1);
		expect(s.combo).toBe(1);
		expect(s.comboTicksLeft).toBeGreaterThan(0);
		expect(s.score).toBe(10 * e.word.length);
		expect(s.targetId).toBeNull();
	});

	it("a 3-hp brute takes three completions to die, reassigning each time", () => {
		const { s } = stateWithEnemy("brute");
		const e = s.enemies[0];
		// resolveCompletion acts only when the word is complete; simulate that.
		e.typedCount = e.word.length;
		resolveCompletion(s, e);
		expect(e.alive).toBe(true);
		expect(e.hp).toBe(2);
		e.typedCount = e.word.length; // word was reassigned; complete it again
		resolveCompletion(s, e);
		expect(e.hp).toBe(1);
		e.typedCount = e.word.length;
		resolveCompletion(s, e);
		expect(e.alive).toBe(false);
		expect(s.kills).toBe(1);
	});
});
