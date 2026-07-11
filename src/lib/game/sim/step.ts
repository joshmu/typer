import { isCharMatch } from "@/lib/core/text/char-match";
import { resolveCompletion } from "./combat";
import { dist } from "./math";
import { MOVEMENTS, makeNoise } from "./movement";
import { runWaveDirector } from "./spawner";
import { ARENA, type GameState } from "./state";

export type GameEvent = { type: "key"; key: string };

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

	// wave director: intermissions + escalating spawns
	runWaveDirector(s);

	// movement + player collision
	for (const e of s.enemies) {
		if (!e.alive) continue;
		const v = MOVEMENTS[e.movement](e, s.tick, makeNoise(e.id));
		e.pos.x += v.x;
		e.pos.y += v.y;
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

	// combo decay
	if (s.comboTicksLeft > 0) {
		s.comboTicksLeft -= 1;
		if (s.comboTicksLeft === 0) s.combo = 0;
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
				s.combo = 0;
				s.comboTicksLeft = 0;
				continue;
			}
			const picked = candidates[0];
			picked.typedCount = 1;
			s.targetId = picked.id;
			resolveCompletion(s, picked);
			continue;
		}
		if (isCharMatch(ev.key, target.word[target.typedCount])) {
			target.typedCount += 1;
			resolveCompletion(s, target);
		} else {
			s.misses += 1;
			s.combo = 0;
			s.comboTicksLeft = 0;
		}
	}

	// prune enemies killed this tick so state size tracks live enemies only
	s.enemies = s.enemies.filter((e) => e.alive);
	return s;
}
