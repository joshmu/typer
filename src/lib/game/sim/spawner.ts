import { getArchetype } from "../content/enemies";
import { pickWordForTier } from "../content/words";
import { createEnemy } from "./enemy-factory";
import { randomPointOnCircle } from "./math";
import { nextFloat } from "./rng";
import { ARENA, type GameState, type Vec2 } from "./state";

export const MAX_ALIVE = 8;
export const SPAWN_COOLDOWN_TICKS = 45;
export const INTERMISSION_TICKS = 180;
export const INITIAL_INTERMISSION_TICKS = 60;

export function waveEnemyCount(wave: number): number {
	return 3 + wave * 2;
}

/**
 * Pick which archetype to spawn for a wave. Plan 2 ships the interim
 * grunt-only body; Plan 3 (roster) replaces the body with wave-banded
 * weighting over the full table WITHOUT changing this signature.
 */
export function selectArchetypeId(
	wave: number,
	rngState: number,
): [id: string, next: number] {
	const [, next] = nextFloat(rngState);
	return ["grunt", next];
}

export function spawnFromArchetype(
	s: GameState,
	archetypeId: string,
	pos: Vec2,
): void {
	const arch = getArchetype(archetypeId);
	const initials = new Set(
		s.enemies.filter((e) => e.alive).map((e) => e.word[0]),
	);
	const [word, next] = pickWordForTier(arch.tier, s.rngState, initials);
	s.rngState = next;
	const enemy = createEnemy(arch, s.nextEnemyId, pos, s.tick, word);
	s.nextEnemyId += 1;
	s.enemies = [...s.enemies, enemy];
}

export function runWaveDirector(s: GameState): void {
	if (s.spawnCooldown > 0) s.spawnCooldown -= 1;

	if (s.wavePhase === "intermission") {
		if (s.intermissionTicksLeft > 0) {
			s.intermissionTicksLeft -= 1;
			return;
		}
		s.wave += 1;
		s.spawnQueueRemaining = waveEnemyCount(s.wave);
		s.spawnCooldown = 0;
		s.wavePhase = "active";
		return;
	}

	// active
	const aliveCount = s.enemies.filter((e) => e.alive).length;
	if (
		s.spawnQueueRemaining > 0 &&
		aliveCount < MAX_ALIVE &&
		s.spawnCooldown <= 0
	) {
		const [pos, r1] = randomPointOnCircle(s.rngState, ARENA.spawnRadius);
		s.rngState = r1;
		const [id, r2] = selectArchetypeId(s.wave, s.rngState);
		s.rngState = r2;
		spawnFromArchetype(s, id, pos);
		s.spawnQueueRemaining -= 1;
		s.spawnCooldown = SPAWN_COOLDOWN_TICKS;
	}

	if (s.spawnQueueRemaining <= 0 && aliveCount === 0) {
		s.wavePhase = "intermission";
		s.intermissionTicksLeft = INTERMISSION_TICKS;
	}
}
