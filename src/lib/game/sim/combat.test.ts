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

	it("advanceWord never grows the chain — length stays == hp for the enemy's whole life", () => {
		const { s } = stateWithEnemy("husk-4"); // hp 3 → 3-word chain
		const e = s.enemies[0];
		const hp = getArchetype("husk-4").hp;
		// walk every legitimate advance (one per non-final completion): length is
		// invariant, the chain is never appended to
		for (let i = 1; i < hp; i++) {
			advanceWord(s, e);
			expect(e.wordIndex).toBe(i);
			expect(e.words.length).toBe(hp);
			expect(currentWord(e).length).toBeGreaterThan(0);
		}
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

	it("damaging one enemy never draws a next word sharing another's current initial", () => {
		// two multi-hp enemies on the field; the damaged one's next word must avoid
		// the OTHER live enemy's current initial (the field-uniqueness rule that
		// spawn already honours, now extended to chain advances). The chain filler
		// starts with 'x', so a next word drawn WITHOUT the field exclusion would
		// collide with B — only an exclusion-aware redraw dodges it.
		const arch = getArchetype("husk-4"); // hp 3 → multi-hp chain
		for (let seed = 1; seed <= 40; seed++) {
			const s = createInitialState(seed);
			const a = createEnemy(arch, 1, { x: 5, y: 0 }, 0, chain(9, arch.hp));
			const bWords = chain(9, arch.hp); // B's current word starts with 'x'
			const b = createEnemy(arch, 2, { x: 9, y: 0 }, 0, bWords);
			s.enemies = [a, b];
			s.nextEnemyId = 3;
			// complete A's current word → hp drop, advance, redraw next word
			a.typedCount = currentWord(a).length;
			resolveCompletion(s, a);
			expect(a.alive).toBe(true);
			expect(currentWord(a)[0]).not.toBe("x"); // B's live initial excluded
		}
	});

	it("advanceWord keeps the pre-assigned word when it does not collide with any live initial", () => {
		// single enemy on the field (no other enemies/powerups) → no collision is
		// possible, so the queued preview word (words[wordIndex] as spawned) must
		// survive the chip untouched — the bug redrew it unconditionally.
		const { s } = stateWithEnemy("husk-4"); // hp 3 → 3-word chain
		const e = s.enemies[0];
		const preAssignedNext = e.words[1];
		e.typedCount = currentWord(e).length;
		resolveCompletion(s, e);
		expect(e.alive).toBe(true);
		expect(e.wordIndex).toBe(1);
		expect(currentWord(e)).toBe(preAssignedNext);
	});

	it("advanceWord redraws only when the pre-assigned next word collides with a live initial", () => {
		// two multi-hp enemies: B's current word is crafted to share its initial
		// with A's pre-assigned words[1], forcing the collision guard to fire.
		const arch = getArchetype("husk-4"); // hp 3 → 3-word chain
		const s = createInitialState(42);
		const aWords = chain(9, arch.hp); // all "xxxxxxxxx" — words[1] starts with 'x'
		const a = createEnemy(arch, 1, { x: 5, y: 0 }, 0, aWords);
		const bWords = chain(9, arch.hp); // B's current word also starts with 'x'
		const b = createEnemy(arch, 2, { x: 9, y: 0 }, 0, bWords);
		s.enemies = [a, b];
		s.nextEnemyId = 3;
		const preAssignedNext = a.words[1];
		a.typedCount = currentWord(a).length;
		resolveCompletion(s, a);
		expect(a.alive).toBe(true);
		expect(a.wordIndex).toBe(1);
		expect(currentWord(a)).not.toBe(preAssignedNext); // redrawn away from the collision
		expect(currentWord(a)[0]).not.toBe("x"); // avoids B's live initial
	});

	it("chipping a boss NEVER redraws the next word, even when its initial collides with a live enemy", () => {
		// sentence order is sacred for bosses: advanceWord must keep the pre-assigned
		// next word verbatim regardless of the field's live initials. Craft a boss
		// whose next word shares its initial with a live regular enemy — a regular
		// would redraw here; the boss must not.
		const s = createInitialState(42);
		const bossArch = getArchetype("boss-maw");
		// a 3-word "sentence": every word starts with 'x' so the collision guard WOULD
		// fire on a non-boss; the boss must ignore it and keep the pre-assigned word.
		const bossWords = ["xxxxx", "xxxxx", "xxxxx"];
		const boss = createEnemy(bossArch, 1, { x: 5, y: 0 }, 0, bossWords);
		// a live regular whose current word also starts with 'x'
		const decoy = createEnemy(getArchetype("husk-1"), 2, { x: 9, y: 0 }, 0, [
			"xenon",
		]);
		s.enemies = [boss, decoy];
		s.nextEnemyId = 3;
		s.targetId = boss.id;
		const preAssignedNext = boss.words[1];
		boss.typedCount = currentWord(boss).length;
		resolveCompletion(s, boss);
		expect(boss.alive).toBe(true);
		expect(boss.wordIndex).toBe(1);
		// sacred: kept verbatim despite colliding with the decoy's 'x' initial
		expect(currentWord(boss)).toBe(preAssignedNext);
		expect(currentWord(boss)[0]).toBe("x");
	});

	it("a shield absorb CLANGS — resets progress on the SAME word, no damage, no new word", () => {
		const { s } = stateWithEnemy("weaver-1"); // hp 1, shield hits 1
		const e = s.enemies[0];
		expect(e.abilityState.shieldHits).toBe(1);
		const word = currentWord(e);
		const wordsBefore = [...e.words];
		e.typedCount = word.length;
		resolveCompletion(s, e);
		expect(e.alive).toBe(true); // shield ate the completion
		expect(e.hp).toBe(1);
		expect(e.abilityState.shieldHits).toBe(0);
		expect(e.wordIndex).toBe(0); // same word — never advances / pops a new one in
		expect(e.typedCount).toBe(0); // progress reset so the player retypes it
		expect(e.words).toEqual(wordsBefore); // chain unchanged: length still == hp
		expect(currentWord(e)).toBe(word); // literally the same word text
		// the next completion has no shield left → deals damage and kills
		e.typedCount = currentWord(e).length;
		resolveCompletion(s, e);
		expect(e.alive).toBe(false);
		expect(s.kills).toBe(1);
	});

	it("increments the absorbs counter only when a completion is absorbed", () => {
		const { s } = stateWithEnemy("weaver-1"); // hp 1, shield hits 1
		const e = s.enemies[0];
		expect(s.absorbs).toBe(0);
		// first completion clangs off the shield → absorb
		e.typedCount = currentWord(e).length;
		resolveCompletion(s, e);
		expect(s.absorbs).toBe(1);
		expect(e.alive).toBe(true);
		// next completion has no shield left → damages/kills, never an absorb
		e.typedCount = currentWord(e).length;
		resolveCompletion(s, e);
		expect(e.alive).toBe(false);
		expect(s.absorbs).toBe(1);
	});

	it("an armored-front absorb (plated side out) clangs the same word without damage", () => {
		// weaver-3: hp 2, armored-front exposeRadius 4; spawned at dist 5 (> 4 →
		// plated side faces the core, so the completion is absorbed)
		const { s } = stateWithEnemy("weaver-3");
		const e = s.enemies[0];
		const word = currentWord(e);
		const wordsBefore = [...e.words];
		e.typedCount = word.length;
		resolveCompletion(s, e);
		expect(e.hp).toBe(2); // no damage while plated
		expect(e.wordIndex).toBe(0); // same word
		expect(e.typedCount).toBe(0); // progress reset
		expect(currentWord(e)).toBe(word);
		expect(e.words).toEqual(wordsBefore);
	});
});
