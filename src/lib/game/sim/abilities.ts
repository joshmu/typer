import { pickWordForTier } from "../content/words";
import { liveInitials } from "./combat";
import { cosR, dist, sinR } from "./math";
import { spawnFromArchetype } from "./spawner";
import { ARENA, type EnemyState, type GameState } from "./state";

/** Cloak gates only NEW target acquisition, never an in-progress lock. */
export function isTargetable(e: EnemyState, tick: number): boolean {
	if (e.ability?.kind !== "cloak") return true;
	const period = e.ability.interval * 2;
	return (tick - e.spawnTick) % period < e.ability.interval;
}

/**
 * True while a cloak enemy is in its hidden phase — the inverse of
 * `isTargetable` restricted to cloakers. Pure; consumed by the render layer to
 * fade the mesh, and kept here so the visibility rule has a single source.
 */
export function isCloaked(e: EnemyState, tick: number): boolean {
	return e.ability?.kind === "cloak" && !isTargetable(e, tick);
}

/** Shield consumes a hit; armored-front absorbs while the plated side faces
 * the player (dist > exposeRadius). Returns true when this completion deals
 * no hp damage. */
export function absorbsCompletion(e: EnemyState): boolean {
	if (e.ability?.kind === "shield") {
		if (e.abilityState.shieldHits > 0) {
			e.abilityState.shieldHits -= 1;
			return true;
		}
		return false;
	}
	if (e.ability?.kind === "armored-front") {
		return dist(e.pos.x, e.pos.y) > e.ability.exposeRadius;
	}
	return false;
}

export function tickAbility(s: GameState, e: EnemyState): void {
	const ability = e.ability;
	if (!ability) return;
	const age = s.tick - e.spawnTick;

	switch (ability.kind) {
		case "enrage-at-half": {
			if (!e.abilityState.enraged && e.hp <= e.maxHp / 2) {
				e.abilityState.enraged = true;
				e.speed *= ability.speedMult;
			}
			return;
		}
		case "spawn": {
			if (age > 0 && age % ability.rate === 0) {
				const angle = (age * 0.618) % (Math.PI * 2);
				spawnFromArchetype(s, ability.minion, {
					x: e.pos.x + cosR(angle),
					y: e.pos.y + sinR(angle),
				});
			}
			return;
		}
		case "teleport": {
			if (age > 0 && age % ability.interval === 0) {
				const d = dist(e.pos.x, e.pos.y) || 1;
				// never blink into the kill ring: cap the inward jump so the
				// destination stays at or beyond killRadius * 2.
				const maxJump = Math.max(0, d - ARENA.killRadius * 2);
				const jump = Math.min(ability.range, maxJump);
				e.pos.x -= (e.pos.x / d) * jump;
				e.pos.y -= (e.pos.y / d) * jump;
			}
			return;
		}
		case "heal-aura": {
			if (age > 0 && age % ability.interval === 0) {
				for (const ally of s.enemies) {
					if (!ally.alive || ally.id === e.id) continue;
					const dx = ally.pos.x - e.pos.x;
					const dy = ally.pos.y - e.pos.y;
					if (dist(dx, dy) <= ability.radius) {
						ally.hp = Math.min(ally.maxHp, ally.hp + ability.amount);
						// A wounded ally that has already walked into its chain has fewer
						// unwalked slots (`words.length - wordIndex`) than its restored hp.
						// If left alone, a later non-fatal completion advances `wordIndex`
						// past the last word and `currentWord()` goes undefined → a crash on
						// the next keystroke. Grow the visible stack HERE, the moment the
						// heal lands, so the invariant `hp <= words.length - wordIndex`
						// always holds. Fresh words honour the same live-field initial
						// reservation `advanceWord` uses (rng threaded through s.rngState);
						// the array is reassigned (never the shared prior-state array
						// mutated) to keep `step` pure.
						const remaining = ally.words.length - ally.wordIndex;
						if (ally.hp > remaining) {
							const extra: string[] = [];
							for (let i = remaining; i < ally.hp; i++) {
								const [word, next] = pickWordForTier(
									ally.tier,
									s.rngState,
									liveInitials(s, ally.id),
								);
								s.rngState = next;
								extra.push(word);
							}
							ally.words = [...ally.words, ...extra];
						}
					}
				}
			}
			return;
		}
		default:
			// split (handled on death), shield / cloak / armored-front (handled
			// at completion / acquisition time) need no per-tick work.
			return;
	}
}
