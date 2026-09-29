import { pickBossText } from "../content/boss-texts";
import { type EnemyArchetype, isBoss } from "../content/enemies";
import { pickLetter, pickWordChain, pickWordForTier } from "../content/words";
import { currentWord, type EnemyState, type GameState } from "./state";

/**
 * The word chain: an enemy's `words`, walked by `wordIndex`. One completed word
 * is one damage, so for every alive enemy `unwalkedWords(e) === e.hp`. After
 * spawn only this module changes `words` and `wordIndex`. Fresh words avoid the
 * reserved initials so no keystroke is ambiguous between two targets. Arrays
 * are replaced, never mutated, to keep `step` pure.
 */

/** Initials a keystroke could already target: each alive enemy's current word
 * and each powerup word, optionally leaving one enemy out. */
export function reservedInitials(s: GameState, exceptId?: number): Set<string> {
	const initials = new Set<string>();
	for (const e of s.enemies) {
		if (e.alive && e.id !== exceptId) initials.add(currentWord(e)[0]);
	}
	for (const p of s.powerups) initials.add(p.word[0]);
	return initials;
}

/** Words left to type, the current one included. */
export function unwalkedWords(e: EnemyState): number {
	return e.words.length - e.wordIndex;
}

/**
 * Draw a new enemy's chain: a single letter for a frenzy small, a whole sentence
 * for a boss, otherwise `arch.hp` banded words. `createEnemy` derives hp from
 * the chain length.
 */
export function assignChain(
	s: GameState,
	arch: EnemyArchetype,
	singleLetter: boolean,
): string[] {
	const initials = reservedInitials(s);
	let words: string[];
	let next: number;
	if (singleLetter) {
		const [letter, n] = pickLetter(s.rngState, initials);
		words = [letter];
		next = n;
	} else if (arch.role === "boss") {
		[words, next] = pickBossText(s.rngState, initials);
	} else {
		[words, next] = pickWordChain(arch.tier, arch.hp, s.rngState, initials);
	}
	s.rngState = next;
	return words;
}

/**
 * Step onto the next word after a damaging, non-fatal completion. Keeps the
 * previewed word unless its initial is reserved, then redraws that slot. Bosses
 * never redraw: their sentence order is fixed.
 */
export function advanceWord(s: GameState, e: EnemyState): void {
	e.wordIndex += 1;
	e.typedCount = 0;
	if (isBoss(e)) return;
	const initials = reservedInitials(s, e.id);
	if (initials.has(currentWord(e)[0])) {
		const [word, next] = pickWordForTier(e.tier, s.rngState, initials);
		s.rngState = next;
		e.words = e.words.map((w, i) => (i === e.wordIndex ? word : w));
	}
}

/** Append fresh words until the unwalked words cover hp again (after a heal). */
export function growChain(s: GameState, e: EnemyState): void {
	const missing = e.hp - unwalkedWords(e);
	if (missing <= 0) return;
	const initials = reservedInitials(s, e.id);
	const extra: string[] = [];
	for (let i = 0; i < missing; i++) {
		const [word, next] = pickWordForTier(e.tier, s.rngState, initials);
		s.rngState = next;
		extra.push(word);
	}
	e.words = [...e.words, ...extra];
}
