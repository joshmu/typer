import { getArchetype } from "../content/enemies";
import { pickWordForTier } from "../content/words";
import { absorbsCompletion } from "./abilities";
import { cosR, dist, sinR } from "./math";
import {
	CHAIN_COMBO,
	CHAIN_RANGE,
	comboDecayTicks,
	hasPerk,
	isOverclockPrimed,
	killScoreWithPerks,
	knockbackMult,
	PIERCE_DOT,
	PIERCE_RANGE,
	SPLASH_RADIUS,
	scoreWithPerks,
} from "./perks";
import { applyKnockback } from "./physics";
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
	// bosses type a fixed public-domain sentence: word ORDER is sacred, so they
	// NEVER redraw a mid-sentence word — the initial-uniqueness nicety yields to
	// the passage. (Collisions are cosmetic here; the boss is the only long chain.)
	if (getArchetype(e.archetypeId).role === "boss") return;
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
	s.comboTicksLeft = comboDecayTicks(s);
	s.score += killScoreWithPerks(s, currentWord(e).length, s.combo);
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

export type DamageResult = "absorbed" | "chipped" | "killed";

/**
 * Deal ONE point of damage to an enemy — the single code path shared by typed
 * completions and weapon-perk extra damage, so shields / armored-front absorb
 * both identically. Returns what happened; awards NO score (callers own scoring:
 * typed completions add chip/clang score, weapon hits add none, and killEnemy
 * awards the kill score internally). `moveScale` gates the chip recoil like the
 * rest of the tick's velocity work (a hit landed mid-freeze imparts none).
 */
export function dealDamage(
	s: GameState,
	e: EnemyState,
	moveScale = 1,
): DamageResult {
	if (absorbsCompletion(e)) {
		// shield / armored-front: the hit CLANGS off the plating — no damage, and
		// crucially NO new word. The SAME word's progress is reset to 0 so the player
		// retypes it; the chain (and `words.length === hp`) is untouched.
		// `shieldHits` was already decremented inside `absorbsCompletion`.
		e.typedCount = 0;
		s.absorbs += 1;
		return "absorbed";
	}
	e.hp -= 1;
	if (e.hp <= 0) {
		killEnemy(s, e);
		return "killed";
	}
	// multi-hp / boss chain: damaged but alive → recoil out toward the edge, next
	// word. Bosses (imposing) take a softened recoil so they keep forward pressure;
	// heavy-rounds lifts both regular and boss recoil.
	const isBoss = getArchetype(e.archetypeId).role === "boss";
	applyKnockback(e, { x: 0, y: 0 }, knockbackMult(s, isBoss), moveScale);
	advanceWord(s, e);
	return "chipped";
}

/**
 * Weapon-epic detonation off a TYPED kill. Each owned weapon perk deals 1 extra
 * damage (via `dealDamage`, so absorbs apply) to nearby enemies. ONE HOP: these
 * extra hits never re-trigger weapon effects, because only `resolveCompletion`
 * calls this and it never recurses. Candidate scans use `s.enemies` array order
 * and nearest-wins-ties-by-array-order for cross-engine determinism.
 */
function applyWeaponEffects(
	s: GameState,
	victim: EnemyState,
	moveScale: number,
): void {
	const vx = victim.pos.x;
	const vy = victim.pos.y;

	// splash: 1 damage to every OTHER enemy within SPLASH_RADIUS of the victim.
	// Snapshot the candidates first so freshly-spawned split minions are not hit.
	if (hasPerk(s, "splash-rounds")) {
		const targets = s.enemies.filter(
			(o) =>
				o.alive &&
				o.id !== victim.id &&
				dist(o.pos.x - vx, o.pos.y - vy) <= SPLASH_RADIUS,
		);
		for (const o of targets) dealDamage(s, o, moveScale);
	}

	// pierce: 1 damage to the nearest enemy within PIERCE_RANGE roughly BEHIND the
	// victim — further out along the victim's outward radial (cone dot ≥ 0.5).
	if (hasPerk(s, "piercing-bolt")) {
		const vd = dist(vx, vy) || 1;
		const outx = vx / vd;
		const outy = vy / vd;
		let best: EnemyState | undefined;
		let bestDist = Number.POSITIVE_INFINITY;
		for (const o of s.enemies) {
			if (!o.alive || o.id === victim.id) continue;
			const dx = o.pos.x - vx;
			const dy = o.pos.y - vy;
			const d = dist(dx, dy);
			if (d === 0 || d > PIERCE_RANGE) continue;
			if ((dx / d) * outx + (dy / d) * outy < PIERCE_DOT) continue;
			if (d < bestDist) {
				bestDist = d;
				best = o;
			}
		}
		if (best) dealDamage(s, best, moveScale);
	}

	// chain-arc: at combo ≥ CHAIN_COMBO, arc 1 damage to the nearest other enemy
	// within CHAIN_RANGE. `s.combo` already reflects this kill's increment.
	if (hasPerk(s, "chain-arc") && s.combo >= CHAIN_COMBO) {
		let best: EnemyState | undefined;
		let bestDist = Number.POSITIVE_INFINITY;
		for (const o of s.enemies) {
			if (!o.alive || o.id === victim.id) continue;
			const d = dist(o.pos.x - vx, o.pos.y - vy);
			if (d > CHAIN_RANGE) continue;
			if (d < bestDist) {
				bestDist = d;
				best = o;
			}
		}
		if (best) dealDamage(s, best, moveScale);
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
	const result = dealDamage(s, e, moveScale);
	// score: greed applies to every gain; sharpshooter (kill only) is inside
	// killEnemy. Absorb and chip both pay the flat per-word score for the effort.
	if (result === "absorbed" || result === "chipped") {
		s.score += scoreWithPerks(s, 10 * word.length);
	}
	// overclock: a primed streak spends here for +1 damage on this DAMAGING
	// completion, then resets (fires whether or not the enemy is still alive).
	if (result !== "absorbed" && isOverclockPrimed(s)) {
		s.overclockStreak = 0;
		if (e.alive) dealDamage(s, e, moveScale);
	}
	// weapon epics detonate off a typed KILL (one hop — their extra damage never
	// re-triggers weapon effects). Fire once, after all of this hit's damage lands.
	if (!e.alive) applyWeaponEffects(s, e, moveScale);
}
