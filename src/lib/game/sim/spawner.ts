import { ENEMIES, getArchetype } from "../content/enemies";
import { pickLetter, pickWordChain } from "../content/words";
import { createEnemy } from "./enemy-factory";
import { randomPointOnCircle } from "./math";
import { nextFloat, nextInt } from "./rng";
import { ARENA, currentWord, type GameState, type Vec2 } from "./state";

export const MAX_ALIVE = 8;
/**
 * Soft alive cap during a frenzy (swarm) wave — the wave director lets the field
 * grow past MAX_ALIVE up to here so the arena genuinely swarms. The absolute
 * ALIVE_HARD_CAP still applies inside spawnFromArchetype.
 */
export const SWARM_MAX_ALIVE = 12;
/** Chance (0..1) that an eligible wave (>3, non-boss, not back-to-back) rolls a frenzy. */
export const SWARM_CHANCE = 0.2;
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
 * tiers (unlocked at waves 1/3/6/10). Every 5th wave fields exactly ONE boss —
 * its FIRST spawn (playtest: the old ~1-in-3 roll PER SPAWN could stack four
 * or five bosses into wave 5, an unbeatable wall of yellow).
 */
export function selectArchetypeId(
	wave: number,
	rngState: number,
	isFirstOfWave = false,
): [id: string, next: number] {
	const state = rngState;
	if (wave % 5 === 0 && isFirstOfWave) {
		const [bi, r1] = nextInt(state, BOSSES.length);
		return [BOSSES[bi].id, r1];
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
	singleLetter = false,
): boolean {
	const alive = s.enemies.filter((e) => e.alive);
	if (alive.length >= ALIVE_HARD_CAP) return false;
	const arch = getArchetype(archetypeId);
	// reserve both live enemy AND active powerup initials so a keystroke is never
	// ambiguous between a new enemy and a pending powerup pickup
	const initials = new Set(alive.map((e) => currentWord(e)[0]));
	for (const p of s.powerups) initials.add(p.word[0]);
	// one word per hp: completing a word deals one damage, so the chain length is
	// the archetype hp. Frenzy smalls (husk-1/darter-1, hp 1) take a single-letter
	// chain instead — length 1 still satisfies words.length === hp. Only the first
	// word obeys the field-uniqueness reservation.
	let words: string[];
	let next: number;
	if (singleLetter) {
		const [letter, n] = pickLetter(s.rngState, initials);
		words = [letter];
		next = n;
	} else {
		[words, next] = pickWordChain(arch.tier, arch.hp, s.rngState, initials);
	}
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
		// classify the wave the instant it goes active. Boss on every 5th wave;
		// otherwise waves past 3 (and never immediately after a swarm) roll a
		// seeded frenzy. The roll consumes rng only in the eligible branch, so
		// only those wave-starts shift the replay hash.
		if (s.wave % 5 === 0) {
			s.waveKind = "boss";
		} else if (s.wave > 3 && s.wave !== s.lastSwarmWave + 1) {
			const [roll, next] = nextFloat(s.rngState);
			s.rngState = next;
			if (roll < SWARM_CHANCE) {
				s.waveKind = "swarm";
				s.lastSwarmWave = s.wave;
			} else {
				s.waveKind = "normal";
			}
		} else {
			s.waveKind = "normal";
		}
		// frenzy waves field 4× the smalls; everyone else the standard count.
		s.spawnQueueRemaining =
			s.waveKind === "swarm"
				? waveEnemyCount(s.wave) * 4
				: waveEnemyCount(s.wave);
		s.spawnCooldown = 0;
		s.wavePhase = "active";
		return;
	}

	// active
	const isSwarm = s.waveKind === "swarm";
	const softCap = isSwarm ? SWARM_MAX_ALIVE : MAX_ALIVE;
	const aliveCount = s.enemies.filter((e) => e.alive).length;
	if (
		s.spawnQueueRemaining > 0 &&
		aliveCount < softCap &&
		s.spawnCooldown <= 0
	) {
		const [pos, r1] = randomPointOnCircle(s.rngState, ARENA.spawnRadius);
		s.rngState = r1;
		let id: string;
		if (isSwarm) {
			// frenzy: forced tier-1 smalls, seeded 50/50, independent of tier/boss
			// logic (swarm waves are non-multiple-of-5 by construction, but the
			// forced branch guarantees a boss can never appear here regardless).
			const [pick, r2] = nextInt(s.rngState, 2);
			s.rngState = r2;
			id = pick === 0 ? "husk-1" : "darter-1";
		} else {
			// the first spawn of a wave still has the full queue outstanding — that
			// spawn (and only that one) may field the boss on 5th waves
			const isFirstOfWave = s.spawnQueueRemaining === waveEnemyCount(s.wave);
			const [selected, r2] = selectArchetypeId(
				s.wave,
				s.rngState,
				isFirstOfWave,
			);
			s.rngState = r2;
			id = selected;
		}
		spawnFromArchetype(s, id, pos, isSwarm);
		s.spawnQueueRemaining -= 1;
		s.spawnCooldown = isSwarm
			? Math.max(10, Math.floor(waveSpawnCooldown(s.wave) / 3))
			: waveSpawnCooldown(s.wave);
	}

	// recompute after the spawn branch: an enemy fielded this tick must count,
	// so the last queued enemy never completes the wave the instant it appears.
	const aliveAfter = s.enemies.filter((e) => e.alive).length;
	if (s.spawnQueueRemaining <= 0 && aliveAfter === 0) {
		s.wavePhase = "intermission";
		s.intermissionTicksLeft = INTERMISSION_TICKS;
	}
}
