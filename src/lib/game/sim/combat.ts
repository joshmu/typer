import { getArchetype } from "../content/enemies";
import { pickWordForTier } from "../content/words";
import { absorbsCompletion } from "./abilities";
import { cosR, sinR } from "./math";
import { applyKnockback } from "./physics";
import { COMBO_DECAY_TICKS, killScore } from "./score";
import { spawnFromArchetype } from "./spawner";
import { currentWord, type EnemyState, type GameState } from "./state";

/**
 * The initials currently live on the field, excluding one enemy: every other
 * alive enemy's current-word initial plus every active powerup's initial. This
 * is the same reservation `spawn` uses, so a freshly drawn word can never make a
 * keystroke ambiguous between two on-screen targets.
 */
export function liveInitials(s: GameState, exceptId: number): Set<string> {
	const initials = new Set<string>();
	for (const other of s.enemies) {
		if (other.alive && other.id !== exceptId)
			initials.add(currentWord(other)[0]);
	}
	for (const p of s.powerups) initials.add(p.word[0]);
	return initials;
}

/**
 * Advance to the next word in the pre-assigned chain (resetting per-word
 * progress). KEEPS the pre-assigned `words[wordIndex]` — the word the player has
 * already been previewing in the label stack — so the preview is truthful.
 * Redraws that slot ONLY when its initial collides with the field's live
 * initials (`liveInitials`), the sole legitimate reason to break the preview:
 * an unresolved collision would make a keystroke ambiguous with another
 * on-screen enemy. `words.length` is invariant (`=== archetype.hp`) for the
 * enemy's whole life either way — a damaging completion is the ONLY caller, and
 * one is only possible while `hp > 0`, i.e. while an unwalked slot remains, so
 * the chain is never exhausted here and never grows. When redrawing, reassigns
 * the array (never mutates the shared prior-state array) to keep `step` pure;
 * when keeping the word, no array reassignment happens at all.
 */
export function advanceWord(s: GameState, e: EnemyState): void {
	e.wordIndex += 1;
	e.typedCount = 0;
	const initials = liveInitials(s, e.id);
	const preAssigned = e.words[e.wordIndex];
	if (initials.has(preAssigned[0])) {
		const [word, next] = pickWordForTier(e.tier, s.rngState, initials);
		s.rngState = next;
		e.words = e.words.map((w, i) => (i === e.wordIndex ? word : w));
	}
}

export function killEnemy(s: GameState, e: EnemyState): void {
	e.alive = false;
	s.kills += 1;
	s.combo += 1;
	s.comboTicksLeft = COMBO_DECAY_TICKS;
	s.score += killScore(currentWord(e).length, s.combo);
	if (s.targetId === e.id) s.targetId = null;
	if (e.ability?.kind === "split") {
		const { n, minion } = e.ability;
		for (let i = 0; i < n; i++) {
			const angle = (i / n) * Math.PI * 2;
			spawnFromArchetype(s, minion, {
				x: e.pos.x + cosR(angle),
				y: e.pos.y + sinR(angle),
			});
		}
	}
}

export function resolveCompletion(
	s: GameState,
	e: EnemyState,
	moveScale = 1,
): void {
	// Called after every keystroke on the target; act only when the word is done.
	const word = currentWord(e);
	if (e.typedCount < word.length) return;
	if (absorbsCompletion(e)) {
		// shield / armored-front: the hit CLANGS off the plating — no damage, and
		// crucially NO new word. The SAME word's progress is reset to 0 so the player
		// simply retypes it; the chain (and `words.length === hp`) is untouched, so a
		// completed word never pops a fresh word into the stack. Flat score for the
		// effort. `shieldHits` was already decremented inside `absorbsCompletion`.
		s.score += 10 * word.length;
		e.typedCount = 0;
		s.absorbs += 1;
		return;
	}
	e.hp -= 1;
	if (e.hp <= 0) {
		killEnemy(s, e);
		return;
	}
	// multi-hp / boss chain: damaged but alive → chip score, recoil, next word.
	// The hit shoves the enemy back out toward the arena edge; bosses (imposing)
	// take a softened recoil so they keep their menacing forward pressure.
	// `moveScale` gates the recoil so a hit landed during a freeze imparts none.
	const mult = getArchetype(e.archetypeId).role === "boss" ? 0.4 : 1;
	applyKnockback(e, { x: 0, y: 0 }, mult, moveScale);
	s.score += 10 * word.length;
	advanceWord(s, e);
}
