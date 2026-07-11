import { cosR, dist, sinR } from "./math";
import { spawnFromArchetype } from "./spawner";
import type { EnemyState, GameState } from "./state";

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
				const jump = Math.min(ability.range, d);
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
