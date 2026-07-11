import { getArchetype } from "../content/enemies";
import { pickWordForTier } from "../content/words";
import { absorbsCompletion } from "./abilities";
import { cosR, sinR } from "./math";
import { applyKnockback } from "./physics";
import { COMBO_DECAY_TICKS, killScore } from "./score";
import { spawnFromArchetype } from "./spawner";
import { currentWord, type EnemyState, type GameState } from "./state";

const NO_INITIALS: ReadonlySet<string> = new Set<string>();

/**
 * Advance to the next word in the chain (resetting per-word progress). If the
 * chain has run out — which only happens on an ABSORB completion (shield /
 * armored-front), since multi-hp damage completions stay within the pre-assigned
 * `words.length === hp` chain and the enemy dies on the last one — append a fresh
 * band word so the enemy always has something to type while alive. Reassigns the
 * array (never mutates the shared prior-state array) to keep `step` pure.
 */
export function advanceWord(s: GameState, e: EnemyState): void {
	e.wordIndex += 1;
	e.typedCount = 0;
	if (e.wordIndex >= e.words.length) {
		const [word, next] = pickWordForTier(e.tier, s.rngState, NO_INITIALS);
		s.rngState = next;
		e.words = [...e.words, word];
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
		// shield / armored-front: no damage, but the word is spent — flat score and
		// advance to (or append) the next word in the chain.
		s.score += 10 * word.length;
		advanceWord(s, e);
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
