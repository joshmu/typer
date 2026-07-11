import { ENEMIES, getArchetype } from "../content/enemies";
import { pickWordChain } from "../content/words";
import { createEnemy } from "./enemy-factory";
import { randomPointOnCircle } from "./math";
import { nextFloat, nextInt } from "./rng";
import { ARENA, currentWord, type GameState, type Vec2 } from "./state";

export const MAX_ALIVE = 8;
/**
 * Absolute ceiling on live enemies, enforced inside spawnFromArchetype so that
 * ability-driven spawns (spawn/split minions) — which bypass the wave-director's
 * MAX_ALIVE soft cap — can never flood the arena unbounded.
 */
export const ALIVE_HARD_CAP = 16;
export const INTERMISSION_TICKS = 180;
export const INITIAL_INTERMISSION_TICKS = 60;

export function waveEnemyCount(wave: number): number {
	return 3 + wave * 2;
}

/**
 * Ticks between spawns within a wave. Wave 1 opens slow (90 ticks ≈ 1.5s apart)
 * so the arena never fills before the player has read a single word, then tightens
 * by 10/wave down to a 30-tick floor. Combined with the large spawn radius (long
 * travel) this is the "survivable pacing" grace the playtest demanded.
 */
export function waveSpawnCooldown(wave: number): number {
	return Math.max(30, 100 - wave * 10);
}

type Tier = 1 | 2 | 3 | 4;
const UNLOCK: Record<Tier, number> = { 1: 1, 2: 3, 3: 6, 4: 10 };

function tierWeight(tier: Tier, wave: number): number {
	if (wave < UNLOCK[tier]) return 0;
	switch (tier) {
		case 1:
			return Math.max(1, 10 - wave * 2);
		case 2:
			return Math.min(8, wave - 1);
		case 3:
			return Math.min(8, wave - 4);
		case 4:
			return Math.min(8, wave - 8);
	}
}

const REGULARS = ENEMIES.filter((e) => e.role === "regular");
const BOSSES = ENEMIES.filter((e) => e.role === "boss");

/**
 * Pick which archetype to spawn for a wave: weights regulars by wave-gated
 * tiers (unlocked at waves 1/3/6/10) and fields a boss on every 5th wave.
 */
export function selectArchetypeId(
	wave: number,
	rngState: number,
): [id: string, next: number] {
	// boss waves: ~1-in-3 chance to field a boss
	let state = rngState;
	if (wave % 5 === 0) {
		const [roll, r1] = nextFloat(state);
		state = r1;
		if (roll < 0.34) {
			const [bi, r2] = nextInt(state, BOSSES.length);
			return [BOSSES[bi].id, r2];
		}
	}

	// weighted pick over unlocked regulars
	let total = 0;
	for (const e of REGULARS) total += tierWeight(e.tier as Tier, wave);
	if (total <= 0) return [REGULARS[0].id, state];

	const [f, next] = nextFloat(state);
	let roll = f * total;
	for (const e of REGULARS) {
		roll -= tierWeight(e.tier as Tier, wave);
		if (roll < 0) return [e.id, next];
	}
	return [REGULARS[REGULARS.length - 1].id, next];
}

export function spawnFromArchetype(
	s: GameState,
	archetypeId: string,
	pos: Vec2,
): boolean {
	const alive = s.enemies.filter((e) => e.alive);
	if (alive.length >= ALIVE_HARD_CAP) return false;
	const arch = getArchetype(archetypeId);
	// reserve both live enemy AND active powerup initials so a keystroke is never
	// ambiguous between a new enemy and a pending powerup pickup
	const initials = new Set(alive.map((e) => currentWord(e)[0]));
	for (const p of s.powerups) initials.add(p.word[0]);
	// one word per hp: completing a word deals one damage, so the chain length is
	// the archetype hp. Only the first word obeys the field-uniqueness reservation.
	const [words, next] = pickWordChain(arch.tier, arch.hp, s.rngState, initials);
	s.rngState = next;
	const enemy = createEnemy(arch, s.nextEnemyId, pos, s.tick, words);
	s.nextEnemyId += 1;
	s.enemies = [...s.enemies, enemy];
	return true;
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
		s.spawnCooldown = waveSpawnCooldown(s.wave);
	}

	// recompute after the spawn branch: an enemy fielded this tick must count,
	// so the last queued enemy never completes the wave the instant it appears.
	const aliveAfter = s.enemies.filter((e) => e.alive).length;
	if (s.spawnQueueRemaining <= 0 && aliveAfter === 0) {
		s.wavePhase = "intermission";
		s.intermissionTicksLeft = INTERMISSION_TICKS;
	}
}
