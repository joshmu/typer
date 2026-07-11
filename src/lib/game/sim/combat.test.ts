import { describe, expect, it } from "vitest";
import { getArchetype } from "../content/enemies";
import { advanceWord, killEnemy, resolveCompletion } from "./combat";
import { createEnemy } from "./enemy-factory";
import { createInitialState, currentWord, type GameState } from "./state";

function chain(len: number, count: number): string[] {
	// distinct filler words of a fixed length for deterministic tests
	const words: string[] = [];
	for (let i = 0; i < count; i++) words.push("x".repeat(len));
	return words;
}

function stateWithEnemy(archetypeId: string): {
	s: GameState;
	enemyId: number;
} {
	const s = createInitialState(42);
	const arch = getArchetype(archetypeId);
	const words = arch.hp > 1 ? chain(9, arch.hp) : ["the"];
	const enemy = createEnemy(arch, s.nextEnemyId, { x: 5, y: 0 }, 0, words);
	s.nextEnemyId += 1;
	s.enemies = [enemy];
	s.targetId = enemy.id;
	return { s, enemyId: enemy.id };
}

describe("combat", () => {
	it("advanceWord steps to the next pre-assigned word without appending", () => {
		const { s, enemyId } = stateWithEnemy("husk-4"); // hp 3 → 3-word chain
		const e = s.enemies[0];
		e.typedCount = 4;
		const beforeLen = e.words.length;
		advanceWord(s, e);
		expect(e.wordIndex).toBe(1);
		expect(e.typedCount).toBe(0);
		expect(e.words.length).toBe(beforeLen); // still within the pre-assigned chain
		expect(s.targetId).toBe(enemyId);
	});

	it("advanceWord appends a fresh band word when the chain runs out", () => {
		const { s } = stateWithEnemy("husk-1"); // hp 1 → single-word chain
		const e = s.enemies[0];
		advanceWord(s, e);
		expect(e.wordIndex).toBe(1);
		expect(e.words.length).toBe(2); // appended so the enemy always has a word
		expect(currentWord(e).length).toBeGreaterThan(0);
	});

	it("killEnemy awards combo-scaled score and clears the lock", () => {
		const { s } = stateWithEnemy("husk-1");
		const e = s.enemies[0];
		killEnemy(s, e);
		expect(e.alive).toBe(false);
		expect(s.kills).toBe(1);
		expect(s.combo).toBe(1);
		expect(s.comboTicksLeft).toBeGreaterThan(0);
		expect(s.score).toBe(10 * currentWord(e).length);
		expect(s.targetId).toBeNull();
	});

	it("a 3-hp enemy takes three completions to die, advancing each time", () => {
		const { s } = stateWithEnemy("husk-4");
		const e = s.enemies[0];
		e.typedCount = currentWord(e).length;
		resolveCompletion(s, e);
		expect(e.alive).toBe(true);
		expect(e.hp).toBe(2);
		expect(e.wordIndex).toBe(1);
		e.typedCount = currentWord(e).length;
		resolveCompletion(s, e);
		expect(e.hp).toBe(1);
		expect(e.wordIndex).toBe(2);
		e.typedCount = currentWord(e).length;
		resolveCompletion(s, e);
		expect(e.alive).toBe(false);
		expect(s.kills).toBe(1);
	});

	it("a shield absorb advances the word (appending) without dealing damage", () => {
		const { s } = stateWithEnemy("weaver-1"); // hp 1, shield hits 1
		const e = s.enemies[0];
		expect(e.abilityState.shieldHits).toBe(1);
		e.typedCount = currentWord(e).length;
		resolveCompletion(s, e);
		expect(e.alive).toBe(true); // shield ate the completion
		expect(e.hp).toBe(1);
		expect(e.abilityState.shieldHits).toBe(0);
		expect(e.wordIndex).toBe(1);
		expect(e.words.length).toBe(2); // fresh word appended so it never runs out
		// the next completion has no shield left → deals damage and kills
		e.typedCount = currentWord(e).length;
		resolveCompletion(s, e);
		expect(e.alive).toBe(false);
		expect(s.kills).toBe(1);
	});
});
