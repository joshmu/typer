import { isCharMatch } from "@/lib/core/text/char-match";
import { getArchetype } from "../content/enemies";
import { pickWord } from "../content/words";
import { createEnemy } from "./enemy-factory";
import { nextFloat } from "./rng";
import { ARENA, type EnemyState, type GameState, type Vec2 } from "./state";

export type GameEvent = { type: "key"; key: string };
export const SPAWN_INTERVAL_TICKS = 180;
export const MAX_ALIVE = 8;

/**
 * Euclidean distance using only cross-engine-deterministic ops (+,-,*,/ and
 * the correctly-rounded sqrt). The built-in hypot is implementation-
 * approximated and MUST NOT be used inside the simulation.
 */
function dist(x: number, y: number): number {
	return Math.sqrt(x * x + y * y);
}

/**
 * Deterministic uniform point on a circle of the given radius. The built-in
 * trig approximations are implementation-defined, so instead we rejection-
 * sample a point in the unit disc (only +,-,*,/ and sqrt) and project it onto
 * the circle. Each rejected iteration advances the rng state, keeping the draw
 * deterministic.
 */
export function spawnPoint(
	rngState: number,
	radius: number,
): [pos: Vec2, next: number] {
	let state = rngState;
	let ux = 0;
	let uy = 0;
	let len2 = 0;
	do {
		const [fx, r1] = nextFloat(state);
		const [fy, r2] = nextFloat(r1);
		state = r2;
		ux = fx * 2 - 1;
		uy = fy * 2 - 1;
		len2 = ux * ux + uy * uy;
	} while (len2 > 1 || len2 < 0.0001);
	const len = Math.sqrt(len2);
	return [{ x: (ux / len) * radius, y: (uy / len) * radius }, state];
}

export function step(
	state: GameState,
	events: readonly GameEvent[],
): GameState {
	if (state.status === "gameover") return state;

	const s: GameState = {
		...state,
		tick: state.tick + 1,
		enemies: state.enemies.map((e) => ({
			...e,
			pos: { ...e.pos },
			abilityState: { ...e.abilityState },
		})),
	};

	// spawn
	const aliveCount = s.enemies.filter((e) => e.alive).length;
	if (s.tick % SPAWN_INTERVAL_TICKS === 0 && aliveCount < MAX_ALIVE) {
		const [pos, r1] = spawnPoint(s.rngState, ARENA.spawnRadius);
		const initials = new Set(
			s.enemies.filter((e) => e.alive).map((e) => e.word[0]),
		);
		const [word, r2] = pickWord(r1, initials);
		s.rngState = r2;
		const arch = getArchetype("grunt");
		const enemy = createEnemy(arch, s.nextEnemyId, pos, s.tick, word);
		s.nextEnemyId += 1;
		s.enemies = [...s.enemies, enemy];
	}

	// movement + player collision
	for (const e of s.enemies) {
		if (!e.alive) continue;
		const arch = getArchetype(e.archetypeId);
		const d = dist(e.pos.x, e.pos.y);
		if (d <= ARENA.killRadius) continue;
		const stepLen = Math.min(arch.speed, d);
		e.pos.x -= (e.pos.x / d) * stepLen;
		e.pos.y -= (e.pos.y / d) * stepLen;
		if (dist(e.pos.x, e.pos.y) <= ARENA.killRadius) {
			e.alive = false;
			s.playerHp -= 1;
			if (s.targetId === e.id) s.targetId = null;
			if (s.playerHp <= 0) {
				s.playerHp = 0;
				s.status = "gameover";
			}
		}
	}
	if (s.status === "gameover") {
		s.enemies = s.enemies.filter((e) => e.alive);
		return s;
	}

	// typing
	for (const ev of events) {
		if (ev.type !== "key") continue;
		const target = s.enemies.find((e) => e.id === s.targetId && e.alive);
		if (!target) {
			s.targetId = null;
			const candidates = s.enemies
				.filter((e) => e.alive && isCharMatch(ev.key, e.word[0]))
				.sort((a, b) => dist(a.pos.x, a.pos.y) - dist(b.pos.x, b.pos.y));
			if (candidates.length === 0) {
				s.misses += 1;
				continue;
			}
			const picked = candidates[0];
			picked.typedCount = 1;
			s.targetId = picked.id;
			finishIfComplete(s, picked);
			continue;
		}
		if (isCharMatch(ev.key, target.word[target.typedCount])) {
			target.typedCount += 1;
			finishIfComplete(s, target);
		} else {
			s.misses += 1;
		}
	}

	// prune enemies killed this tick so state size tracks live enemies only
	s.enemies = s.enemies.filter((e) => e.alive);
	return s;
}

function finishIfComplete(s: GameState, e: EnemyState): void {
	if (e.typedCount < e.word.length) return;
	e.alive = false;
	s.kills += 1;
	s.score += 10 * e.word.length;
	s.targetId = null;
}
