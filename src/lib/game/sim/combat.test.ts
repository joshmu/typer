import { describe, expect, it } from "vitest";
import { getArchetype } from "../content/enemies";
import {
	advanceWord,
	dealDamage,
	killEnemy,
	resolveCompletion,
} from "./combat";
import { createEnemy } from "./enemy-factory";
import type { PerkId } from "./perks";
import {
	createInitialState,
	currentWord,
	type EnemyState,
	type GameState,
} from "./state";

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

/** Place an enemy at a position with a single-letter (hp-1) chain unless a
 * word list is given, so a lone completion fells it. */
function enemyAt(
	archetypeId: string,
	id: number,
	pos: { x: number; y: number },
	words: string[] = ["a"],
): EnemyState {
	return createEnemy(getArchetype(archetypeId), id, pos, 0, words);
}

function perkState(perks: PerkId[], enemies: EnemyState[]): GameState {
	const s = createInitialState(42);
	s.perks = perks;
	s.enemies = enemies;
	s.nextEnemyId = enemies.length + 1;
	return s;
}

/** Fully type an enemy's current word so the next resolveCompletion acts. */
function completeWord(s: GameState, e: EnemyState): void {
	e.typedCount = currentWord(e).length;
	s.targetId = e.id;
	resolveCompletion(s, e);
}

describe("dealDamage (shared damage path)", () => {
	it("reports absorbed / chipped / killed", () => {
		const shielded = enemyAt("weaver-1", 1, { x: 5, y: 0 }); // shield hits 1
		const s1 = perkState([], [shielded]);
		expect(dealDamage(s1, shielded)).toBe("absorbed");
		expect(shielded.alive).toBe(true);
		expect(s1.absorbs).toBe(1);

		const multi = enemyAt("husk-4", 2, { x: 5, y: 0 }, ["aa", "bb", "cc"]); // hp 3
		const s2 = perkState([], [multi]);
		expect(dealDamage(s2, multi)).toBe("chipped");
		expect(multi.hp).toBe(2);
		expect(multi.wordIndex).toBe(1);

		const weak = enemyAt("husk-1", 3, { x: 5, y: 0 });
		const s3 = perkState([], [weak]);
		expect(dealDamage(s3, weak)).toBe("killed");
		expect(weak.alive).toBe(false);
		expect(s3.kills).toBe(1);
	});
});

describe("weapon perks", () => {
	it("splash-rounds detonates 1 damage to every enemy within 6 of the victim", () => {
		const victim = enemyAt("husk-1", 1, { x: 5, y: 0 });
		const near = enemyAt("husk-1", 2, { x: 8, y: 0 }); // dist 3 → in radius
		const far = enemyAt("husk-1", 3, { x: 20, y: 0 }); // dist 15 → out
		const s = perkState(["splash-rounds"], [victim, near, far]);
		completeWord(s, victim);
		expect(victim.alive).toBe(false);
		expect(near.alive).toBe(false); // splashed to death
		expect(far.alive).toBe(true);
		expect(s.kills).toBe(2); // victim + splashed neighbour both count
	});

	it("splash respects a shield absorb — a plated neighbour clangs, not dies", () => {
		const victim = enemyAt("husk-1", 1, { x: 5, y: 0 });
		const plated = enemyAt("weaver-1", 2, { x: 8, y: 0 }); // shield hits 1
		const s = perkState(["splash-rounds"], [victim, plated]);
		completeWord(s, victim);
		expect(plated.alive).toBe(true); // shield ate the splash
		expect(plated.abilityState.shieldHits).toBe(0);
		expect(s.absorbs).toBe(1);
		expect(s.kills).toBe(1); // only the victim
	});

	it("piercing-bolt hits the nearest enemy BEHIND the victim, never one in front", () => {
		const victim = enemyAt("husk-1", 1, { x: 5, y: 0 }); // outward radial = +x
		const behind = enemyAt("husk-1", 2, { x: 9, y: 0 }); // further out → behind
		const front = enemyAt("husk-1", 3, { x: 2, y: 0 }); // toward core → in front
		const s = perkState(["piercing-bolt"], [victim, behind, front]);
		completeWord(s, victim);
		expect(behind.alive).toBe(false); // pierced
		expect(front.alive).toBe(true); // in front of the bolt, spared
	});

	it("chain-arc only fires at combo ≥ 10", () => {
		// combo 8 → kill makes 9 (< 10): no arc
		const v1 = enemyAt("husk-1", 1, { x: 5, y: 0 });
		const n1 = enemyAt("husk-1", 2, { x: 8, y: 0 });
		const s1 = perkState(["chain-arc"], [v1, n1]);
		s1.combo = 8;
		completeWord(s1, v1);
		expect(n1.alive).toBe(true);

		// combo 9 → kill makes 10 (≥ 10): arcs to the neighbour
		const v2 = enemyAt("husk-1", 1, { x: 5, y: 0 });
		const n2 = enemyAt("husk-1", 2, { x: 8, y: 0 });
		const s2 = perkState(["chain-arc"], [v2, n2]);
		s2.combo = 9;
		completeWord(s2, v2);
		expect(n2.alive).toBe(false);
	});

	it("weapon-triggered kills do not re-trigger weapon effects (one hop)", () => {
		// splash victim kills A; A is adjacent to B, but splash off A must NOT chain.
		const victim = enemyAt("husk-1", 1, { x: 5, y: 0 });
		const a = enemyAt("husk-1", 2, { x: 8, y: 0 }); // dist 3 → within 6 of victim
		const b = enemyAt("husk-1", 3, { x: 13, y: 0 }); // dist 8 from victim (out), 5 from A
		const s = perkState(["splash-rounds"], [victim, a, b]);
		completeWord(s, victim);
		expect(victim.alive).toBe(false);
		expect(a.alive).toBe(false); // one hop from the victim
		expect(b.alive).toBe(true); // second hop suppressed
	});
});

describe("heavy-rounds knockback", () => {
	it("doubles the regular chip recoil", () => {
		const base = enemyAt("husk-4", 1, { x: 5, y: 0 }, ["aa", "bb", "cc"]);
		const sBase = perkState([], [base]);
		completeWord(sBase, base);
		const baseVel = Math.hypot(base.vel.x, base.vel.y);

		const heavy = enemyAt("husk-4", 1, { x: 5, y: 0 }, ["aa", "bb", "cc"]);
		const sHeavy = perkState(["heavy-rounds"], [heavy]);
		completeWord(sHeavy, heavy);
		const heavyVel = Math.hypot(heavy.vel.x, heavy.vel.y);

		expect(heavyVel).toBeCloseTo(baseVel * 2, 6);
	});
});

describe("overclock", () => {
	it("spends a primed streak for +1 damage, felling a 2-hp enemy in one completion", () => {
		const e = enemyAt("husk-3", 1, { x: 5, y: 0 }, ["aa", "bb"]); // hp 2
		const s = perkState(["overclock"], [e]);
		s.overclockStreak = 20;
		completeWord(s, e);
		expect(e.alive).toBe(false); // chip + overclock bonus = 2 damage
		expect(s.overclockStreak).toBe(0); // consumed
	});

	it("does nothing below the streak threshold", () => {
		const e = enemyAt("husk-3", 1, { x: 5, y: 0 }, ["aa", "bb"]); // hp 2
		const s = perkState(["overclock"], [e]);
		s.overclockStreak = 19;
		completeWord(s, e);
		expect(e.alive).toBe(true); // only the single chip landed
		expect(e.hp).toBe(1);
	});
});
