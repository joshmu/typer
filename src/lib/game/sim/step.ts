import { isCharMatch } from "@/lib/core/text/char-match";
import { isCloaked, isTargetable, tickAbility } from "./abilities";
import { resolveCompletion } from "./combat";
import { dist } from "./math";
import { MOVEMENTS } from "./movement";
import {
	applyPowerup,
	POWERUP_SPAWN_EVERY_KILLS,
	SLOW_FACTOR,
	spawnPowerup,
} from "./powerups";
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
		powerups: state.powerups.map((p) => ({ ...p, pos: { ...p.pos } })),
	};

	// wave director: intermissions + escalating spawns
	runWaveDirector(s);

	// abilities (spawn / heal / teleport / enrage) — O(enemies)
	for (const e of s.enemies) {
		if (e.alive && e.ability) tickAbility(s, e);
	}

	// movement + player collision
	let moveScale = 1;
	if (s.freezeTicksLeft > 0) moveScale = 0;
	else if (s.slowTicksLeft > 0) moveScale = SLOW_FACTOR;
	for (const e of s.enemies) {
		if (!e.alive) continue;
		const v = MOVEMENTS[e.movement](e, s.tick);
		e.pos.x += v.x * moveScale;
		e.pos.y += v.y * moveScale;
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

	// effect timers
	if (s.freezeTicksLeft > 0) s.freezeTicksLeft -= 1;
	if (s.slowTicksLeft > 0) s.slowTicksLeft -= 1;

	// powerup lifetime + kill-milestone spawn
	if (s.powerups.length > 0) {
		s.powerups = s.powerups.filter((p) => p.expiresTick > s.tick);
		if (
			s.targetPowerupId !== null &&
			!s.powerups.some((p) => p.id === s.targetPowerupId)
		) {
			s.targetPowerupId = null;
		}
	}
	if (
		s.kills > 0 &&
		s.kills % POWERUP_SPAWN_EVERY_KILLS === 0 &&
		s.powerups.length === 0
	) {
		spawnPowerup(s);
	}

	// typing
	for (const ev of events) {
		if (ev.type !== "key") continue;

		// 1) advance a locked powerup
		if (s.targetPowerupId !== null) {
			const pu = s.powerups.find((p) => p.id === s.targetPowerupId);
			if (pu && isCharMatch(ev.key, pu.word[pu.typedCount])) {
				pu.typedCount += 1;
				if (pu.typedCount >= pu.word.length) {
					applyPowerup(s, pu.kind);
					s.powerups = s.powerups.filter((p) => p.id !== pu.id);
					s.targetPowerupId = null;
				}
				continue;
			}
			if (pu) {
				s.misses += 1;
				s.combo = 0;
				s.comboTicksLeft = 0;
				continue;
			}
			s.targetPowerupId = null;
		}

		// 2) advance a locked enemy
		const target = s.enemies.find((e) => e.id === s.targetId && e.alive);
		if (target) {
			if (isCharMatch(ev.key, target.word[target.typedCount])) {
				target.typedCount += 1;
				resolveCompletion(s, target);
			} else {
				s.misses += 1;
				s.combo = 0;
				s.comboTicksLeft = 0;
			}
			continue;
		}
		s.targetId = null;

		// 3) acquire a new enemy target (preferred), then a powerup
		const candidates = s.enemies
			.filter(
				(e) =>
					e.alive && isTargetable(e, s.tick) && isCharMatch(ev.key, e.word[0]),
			)
			.sort((a, b) => dist(a.pos.x, a.pos.y) - dist(b.pos.x, b.pos.y));
		if (candidates.length > 0) {
			const picked = candidates[0];
			picked.typedCount = 1;
			s.targetId = picked.id;
			resolveCompletion(s, picked);
			continue;
		}

		const pu = s.powerups.find((p) => isCharMatch(ev.key, p.word[0]));
		if (pu) {
			pu.typedCount = 1;
			s.targetPowerupId = pu.id;
			if (pu.word.length === 1) {
				applyPowerup(s, pu.kind);
				s.powerups = s.powerups.filter((p) => p.id !== pu.id);
				s.targetPowerupId = null;
			}
			continue;
		}

		// the key matches only a cloaked (hidden-phase) enemy's initial: it is
		// unfair to penalise a target the player cannot yet see, so ignore it —
		// no miss, no combo break — rather than count it against them
		if (
			s.enemies.some(
				(e) =>
					e.alive && isCloaked(e, s.tick) && isCharMatch(ev.key, e.word[0]),
			)
		) {
			continue;
		}

		s.misses += 1;
		s.combo = 0;
		s.comboTicksLeft = 0;
	}

	// prune enemies killed this tick so state size tracks live enemies only
	s.enemies = s.enemies.filter((e) => e.alive);
	return s;
}
