import type { MovementId } from "../content/enemies";
import { dist, sinR } from "./math";
import type { EnemyState, Vec2 } from "./state";

/**
 * Pure per-enemy noise: a hash of (id, salt) in [0,1). No state threading and,
 * critically, no per-enemy closure — movement fns call this directly so the hot
 * loop allocates nothing per enemy per tick. The hash math is identical to the
 * previous `makeNoise(id)(salt)` closure, so seeded replays stay bit-identical.
 */
export function noise2(id: number, salt: number): number {
	let h =
		(Math.imul(id | 0, 0x9e3779b1) + Math.imul(salt | 0, 0x85ebca77)) >>> 0;
	h = Math.imul(h ^ (h >>> 15), h | 1);
	h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
	return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
}

export type MovementFn = (enemy: EnemyState, tick: number) => Vec2;

const TAU = Math.PI * 2;

const chase: MovementFn = (e) => {
	const d = dist(e.pos.x, e.pos.y) || 1;
	return { x: (-e.pos.x / d) * e.speed, y: (-e.pos.y / d) * e.speed };
};

const zigzag: MovementFn = (e, tick) => {
	const d = dist(e.pos.x, e.pos.y) || 1;
	const inx = -e.pos.x / d;
	const iny = -e.pos.y / d;
	const phase = noise2(e.id, 0) * TAU;
	const wobble = sinR((tick - e.spawnTick) * 0.15 + phase) * 0.6;
	// perpendicular of (inx, iny) is (-iny, inx)
	return {
		x: (inx - iny * wobble) * e.speed,
		y: (iny + inx * wobble) * e.speed,
	};
};

const ORBIT_TICKS = 120;
const orbitThenDive: MovementFn = (e, tick) => {
	const d = dist(e.pos.x, e.pos.y) || 1;
	const inx = -e.pos.x / d;
	const iny = -e.pos.y / d;
	if (tick - e.spawnTick < ORBIT_TICKS) {
		// mostly tangential, slight inward drift
		return {
			x: (-iny * 0.9 + inx * 0.1) * e.speed,
			y: (inx * 0.9 + iny * 0.1) * e.speed,
		};
	}
	return { x: inx * e.speed * 1.6, y: iny * e.speed * 1.6 };
};

const DASH_TICKS = 40;
const PAUSE_TICKS = 40;
const dashPause: MovementFn = (e, tick) => {
	const phase = (tick - e.spawnTick) % (DASH_TICKS + PAUSE_TICKS);
	if (phase >= DASH_TICKS) return { x: 0, y: 0 };
	const d = dist(e.pos.x, e.pos.y) || 1;
	return {
		x: (-e.pos.x / d) * e.speed * 2.2,
		y: (-e.pos.y / d) * e.speed * 2.2,
	};
};

const flank: MovementFn = (e, _tick) => {
	const d = dist(e.pos.x, e.pos.y) || 1;
	const inx = -e.pos.x / d;
	const iny = -e.pos.y / d;
	const side = noise2(e.id, 1) < 0.5 ? -1 : 1;
	const bias = Math.min(0.8, d / 20) * side; // more sideways when far, straightens in
	return { x: (inx - iny * bias) * e.speed, y: (iny + inx * bias) * e.speed };
};

const spiral: MovementFn = (e, _tick) => {
	const d = dist(e.pos.x, e.pos.y) || 1;
	const inx = -e.pos.x / d;
	const iny = -e.pos.y / d;
	const dir = noise2(e.id, 2) < 0.5 ? -1 : 1;
	const t = Math.min(1, d / 20); // 1 far, 0 near
	const tang = 0.9 * t * dir;
	const inward = 1 - 0.5 * t; // always some inward pull → guaranteed to close in
	return {
		x: (inx * inward - iny * tang) * e.speed,
		y: (iny * inward + inx * tang) * e.speed,
	};
};

// spiral-fast: a tight, fast corkscrew. Tangential factor is 3× `spiral`'s (so
// the angular velocity reads ~3× at the same radius) while a steady inward pull
// keeps the radius shrinking every tick. Stateless — never touches movePhase.
const spiralFast: MovementFn = (e, _tick) => {
	const d = dist(e.pos.x, e.pos.y) || 1;
	const inx = -e.pos.x / d;
	const iny = -e.pos.y / d;
	const dir = noise2(e.id, 2) < 0.5 ? -1 : 1;
	const t = Math.min(1, d / 20); // 1 far, 0 near
	const tang = 2.7 * t * dir; // 3× the base spiral's 0.9
	const inward = 0.7 - 0.2 * t; // 0.5 far → 0.7 near: steady, always-closing pull
	return {
		x: (inx * inward - iny * tang) * e.speed,
		y: (iny * inward + inx * tang) * e.speed,
	};
};

// feint — the jump scare. A stateful, one-way three-phase approach driven by the
// enemy's own movePhase/phaseTick (mutated here, on step's cloned draft):
//   phase 0: sprint straight at the core at ×3 base speed
//   phase 1: on crossing dist ≤ 10, recoil OUTWARD at ×0.5 base for ~90 ticks
//   phase 2: creep back inward at ×0.4 base, forever
// Phases only ever advance — knockback shoving the enemy back out past dist 10
// cannot rewind it to a fresh sprint (the phase-0 branch is skipped once left).
const FEINT_SPRINT = 3;
const FEINT_RETREAT = 0.5;
const FEINT_CREEP = 0.4;
const FEINT_TRIGGER_DIST = 10;
const FEINT_RETREAT_TICKS = 90;
const feint: MovementFn = (e) => {
	const d = dist(e.pos.x, e.pos.y) || 1;
	const inx = -e.pos.x / d;
	const iny = -e.pos.y / d;
	if (e.movePhase === 0) {
		if (d > FEINT_TRIGGER_DIST) {
			return {
				x: inx * e.speed * FEINT_SPRINT,
				y: iny * e.speed * FEINT_SPRINT,
			};
		}
		// crossed the trigger — commit to the recoil (one-way)
		e.movePhase = 1;
		e.phaseTick = 0;
	}
	if (e.movePhase === 1) {
		if (e.phaseTick < FEINT_RETREAT_TICKS) {
			e.phaseTick += 1;
			// outward = negated inward direction
			return {
				x: -inx * e.speed * FEINT_RETREAT,
				y: -iny * e.speed * FEINT_RETREAT,
			};
		}
		e.movePhase = 2;
	}
	// phase 2: slow inward creep
	return { x: inx * e.speed * FEINT_CREEP, y: iny * e.speed * FEINT_CREEP };
};

export const MOVEMENTS: Record<MovementId, MovementFn> = {
	chase,
	zigzag,
	"orbit-then-dive": orbitThenDive,
	"dash-pause": dashPause,
	flank,
	spiral,
	"spiral-fast": spiralFast,
	feint,
};
