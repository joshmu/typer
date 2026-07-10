import { isCharMatch } from "@/lib/core/text/char-match";
import { getArchetype } from "../content/enemies";
import { pickWord } from "../content/words";
import { nextFloat } from "./rng";
import { ARENA, type EnemyState, type GameState } from "./state";

export type GameEvent = { type: "key"; key: string };
export const SPAWN_INTERVAL_TICKS = 180;
export const MAX_ALIVE = 8;

export function step(
	state: GameState,
	events: readonly GameEvent[],
): GameState {
	if (state.status === "gameover") return state;

	const s: GameState = {
		...state,
		tick: state.tick + 1,
		enemies: state.enemies.map((e) => ({ ...e, pos: { ...e.pos } })),
	};

	// spawn
	const aliveCount = s.enemies.filter((e) => e.alive).length;
	if (s.tick % SPAWN_INTERVAL_TICKS === 0 && aliveCount < MAX_ALIVE) {
		const [angleT, r1] = nextFloat(s.rngState);
		const initials = new Set(
			s.enemies.filter((e) => e.alive).map((e) => e.word[0]),
		);
		const [word, r2] = pickWord(r1, initials);
		s.rngState = r2;
		const angle = angleT * Math.PI * 2;
		const arch = getArchetype("grunt");
		const enemy: EnemyState = {
			id: s.nextEnemyId,
			archetypeId: arch.id,
			pos: {
				x: Math.cos(angle) * ARENA.spawnRadius,
				y: Math.sin(angle) * ARENA.spawnRadius,
			},
			word,
			typedCount: 0,
			hp: arch.hp,
			alive: true,
		};
		s.nextEnemyId += 1;
		s.enemies = [...s.enemies, enemy];
	}

	// movement + player collision
	for (const e of s.enemies) {
		if (!e.alive) continue;
		const arch = getArchetype(e.archetypeId);
		const dist = Math.hypot(e.pos.x, e.pos.y);
		if (dist <= ARENA.killRadius) continue;
		const stepLen = Math.min(arch.speed, dist);
		e.pos.x -= (e.pos.x / dist) * stepLen;
		e.pos.y -= (e.pos.y / dist) * stepLen;
		if (Math.hypot(e.pos.x, e.pos.y) <= ARENA.killRadius) {
			e.alive = false;
			s.playerHp -= 1;
			if (s.targetId === e.id) s.targetId = null;
			if (s.playerHp <= 0) {
				s.playerHp = 0;
				s.status = "gameover";
			}
		}
	}
	if (s.status === "gameover") return s;

	// typing
	for (const ev of events) {
		if (ev.type !== "key") continue;
		const target = s.enemies.find((e) => e.id === s.targetId && e.alive);
		if (!target) {
			s.targetId = null;
			const candidates = s.enemies
				.filter((e) => e.alive && isCharMatch(ev.key, e.word[0]))
				.sort(
					(a, b) => Math.hypot(a.pos.x, a.pos.y) - Math.hypot(b.pos.x, b.pos.y),
				);
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

	return s;
}

function finishIfComplete(s: GameState, e: EnemyState): void {
	if (e.typedCount < e.word.length) return;
	e.alive = false;
	s.kills += 1;
	s.score += 10 * e.word.length;
	s.targetId = null;
}
