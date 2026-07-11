import { pickWordForTier } from "../content/words";
import { absorbsCompletion } from "./abilities";
import { cosR, sinR } from "./math";
import { COMBO_DECAY_TICKS, killScore } from "./score";
import { spawnFromArchetype } from "./spawner";
import type { EnemyState, GameState } from "./state";

export function reassignWord(s: GameState, e: EnemyState): void {
	const initials = new Set(
		s.enemies.filter((x) => x.alive && x.id !== e.id).map((x) => x.word[0]),
	);
	const [word, next] = pickWordForTier(e.tier, s.rngState, initials);
	s.rngState = next;
	e.word = word;
	e.typedCount = 0;
}

export function killEnemy(s: GameState, e: EnemyState): void {
	e.alive = false;
	s.kills += 1;
	s.combo += 1;
	s.comboTicksLeft = COMBO_DECAY_TICKS;
	s.score += killScore(e.word.length, s.combo);
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

export function resolveCompletion(s: GameState, e: EnemyState): void {
	// Called after every keystroke on the target; act only when the word is done.
	if (e.typedCount < e.word.length) return;
	if (absorbsCompletion(e)) {
		s.score += 10 * e.word.length;
		reassignWord(s, e);
		return;
	}
	e.hp -= 1;
	if (e.hp <= 0) {
		killEnemy(s, e);
		return;
	}
	// multi-hp / boss chain: damaged but alive → chip score + next word
	s.score += 10 * e.word.length;
	reassignWord(s, e);
}
