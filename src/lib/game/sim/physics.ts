import { getArchetype } from "../content/enemies";
import { dist } from "./math";
import type { EnemyState, Vec2 } from "./state";

/**
 * Deterministic motion physics for the pure sim. Enemy behaviours (movement.ts)
 * now emit a DESIRED velocity; this layer integrates it with inertia, crowd
 * separation and knockback so the horde moves like bodies with mass rather than
 * teleporting dots. Math is `dist`/`sqrt` and `+ - * /` only — the determinism
 * scan stays green and seeded replays remain bit-identical across engines.
 */
export const PHYS = {
	// max per-tick change to a velocity vector — the smaller this is, the more
	// inertia enemies carry (they cannot reverse or turn instantly)
	accel: 0.006,
	// per-tick outward shove applied to each enemy in an overlapping pair
	sepStrength: 0.02,
	// impulse added to velocity on a knockback hit
	knockback: 0.35,
} as const;

/**
 * Bend `e.vel` toward `desired`, moving at most `PHYS.accel` per tick. Within one
 * accel step of the target it snaps exactly onto it. Mutates the draft enemy.
 *
 * `scale` (freeze 0 / slow 0.5, default 1) shrinks the accel budget so the same
 * time-dilation that scales integration also scales velocity change: at scale 0
 * the velocity is left perfectly inert (nothing to accumulate, nothing to scatter
 * on unfreeze); at 0.5 the turn rate is halved in step with the halved speed.
 */
export function steer(e: EnemyState, desired: Vec2, scale = 1): void {
	const accel = PHYS.accel * scale;
	const dx = desired.x - e.vel.x;
	const dy = desired.y - e.vel.y;
	const d = dist(dx, dy);
	if (d <= accel || d === 0) {
		// already within one (scaled) step, or exactly on target: snap. At scale 0
		// with d>0 this is skipped and the divide below yields a zero delta.
		e.vel.x = desired.x;
		e.vel.y = desired.y;
		return;
	}
	const f = accel / d;
	e.vel.x += dx * f;
	e.vel.y += dy * f;
}

/**
 * Pairwise crowd separation: any two enemies closer than 55% of their combined
 * body size shove each other outward (added to velocity, integrated by the
 * caller). O(n²), but n ≤ ALIVE_HARD_CAP (16) so it stays trivially cheap.
 *
 * `scale` (freeze 0 / slow 0.5, default 1) scales the shove impulse so frozen
 * enemies gain no separation velocity to unleash on unfreeze.
 */
export function separate(enemies: EnemyState[], scale = 1): void {
	const n = enemies.length;
	// hoist body sizes once so the O(n²) pairwise loop below does no getArchetype
	// (Map) lookups in its inner iterations
	const sizes = new Array<number>(n);
	for (let i = 0; i < n; i++) {
		sizes[i] = getArchetype(enemies[i].archetypeId).size;
	}
	for (let i = 0; i < n; i++) {
		const a = enemies[i];
		const sizeA = sizes[i];
		for (let j = i + 1; j < n; j++) {
			const b = enemies[j];
			const minGap = (sizeA + sizes[j]) * 0.55;
			let dx = a.pos.x - b.pos.x;
			let dy = a.pos.y - b.pos.y;
			let d = dist(dx, dy);
			if (d >= minGap) continue;
			// exactly-coincident pair: deterministically split along +x so the push
			// direction is well-defined without any trig or randomness
			if (d === 0) {
				dx = 1;
				dy = 0;
				d = 1;
			}
			// scale the shove by how deep the overlap is, so barely-touching pairs
			// nudge gently and heavy overlaps snap apart
			const push = (PHYS.sepStrength * (minGap - d) * scale) / minGap;
			const ux = dx / d;
			const uy = dy / d;
			a.vel.x += ux * push;
			a.vel.y += uy * push;
			b.vel.x -= ux * push;
			b.vel.y -= uy * push;
		}
	}
}

/**
 * Add a knockback impulse to `e.vel`, directed from `awayFrom` toward the enemy
 * (so a completion hit shoves it back out toward the arena edge). `mult` scales
 * the impulse — bosses take a softened recoil. `scale` (freeze 0 / slow 0.5,
 * default 1) gates it in step with the rest of the tick's velocity work, so a
 * completion landed mid-freeze imparts no recoil. Mutates the draft enemy.
 */
export function applyKnockback(
	e: EnemyState,
	awayFrom: Vec2,
	mult = 1,
	scale = 1,
): void {
	let dx = e.pos.x - awayFrom.x;
	let dy = e.pos.y - awayFrom.y;
	let d = dist(dx, dy);
	if (d === 0) {
		dx = 1;
		dy = 0;
		d = 1;
	}
	const impulse = PHYS.knockback * mult * scale;
	e.vel.x += (dx / d) * impulse;
	e.vel.y += (dy / d) * impulse;
}
