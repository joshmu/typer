import type { Ability, MovementId } from "../content/enemies";
import { createRngState } from "./rng";

export type Vec2 = { x: number; y: number };
export type AbilityState = { shieldHits: number; enraged: boolean };
export type EnemyState = {
	id: number;
	archetypeId: string;
	pos: Vec2;
	vel: Vec2;
	// full word chain assigned at spawn: `words.length === archetype.hp` so one
	// completion = one damage, and the length is invariant for the enemy's whole
	// life (every word visible in the stack from spawn). `wordIndex` is the current
	// word; `typedCount` is the progress within it. A shield/armored absorb neither
	// advances `wordIndex` nor appends — it just resets `typedCount` to 0 (clang),
	// so completing a word never pops a fresh word into the stack.
	words: string[];
	wordIndex: number;
	typedCount: number;
	hp: number;
	maxHp: number;
	alive: boolean;
	spawnTick: number;
	speed: number;
	tier: 1 | 2 | 3 | 4;
	movement: MovementId;
	ability: Ability | null;
	abilityState: AbilityState;
	// stateful-movement scratch: `movePhase` is a one-way phase counter (advances,
	// never resets — knockback can't rewind it) and `phaseTick` counts ticks within
	// the current phase. Both are 0 for stateless movements (chase/spiral/…) and
	// serialize into the replay hash like every other field.
	movePhase: number;
	phaseTick: number;
};
export type PowerupKind = "freeze" | "bomb" | "heal" | "slow";
export type PowerupPickup = {
	id: number;
	kind: PowerupKind;
	word: string;
	typedCount: number;
	pos: Vec2;
	expiresTick: number;
};
export type GameStatus = "running" | "gameover";
export type GameState = {
	tick: number;
	status: GameStatus;
	rngState: number;
	score: number;
	kills: number;
	misses: number;
	hits: number;
	// monotonic count of completions that CLANGED off plating (shield / armored-
	// front) — the render layer fires its dull-spark clang only when this
	// increments, so a same-frame typedCount reset can never lose the feedback
	absorbs: number;
	playerHp: number;
	targetId: number | null;
	nextEnemyId: number;
	enemies: EnemyState[];
	wave: number;
	wavePhase: "intermission" | "active";
	// classification of the ACTIVE wave, decided the instant the wave increments
	// (see runWaveDirector). "boss" every 5th wave; "swarm" a seeded frenzy of
	// single-letter tier-1 smalls; "normal" otherwise. Serialized in the hash.
	waveKind: "normal" | "swarm" | "boss";
	// the last wave number that rolled "swarm" — guards against back-to-back
	// frenzies (a swarm can never immediately follow another swarm).
	lastSwarmWave: number;
	spawnQueueRemaining: number;
	spawnCooldown: number;
	intermissionTicksLeft: number;
	combo: number;
	comboTicksLeft: number;
	maxPlayerHp: number;
	freezeTicksLeft: number;
	slowTicksLeft: number;
	targetPowerupId: number | null;
	powerups: PowerupPickup[];
	nextPowerupId: number;
	lastPowerupMilestone: number;
	// monotonic count of powerups actually applied — the render layer pulses its
	// activation ring only when this increments, so an expiring pickup can't fake it
	powerupsUsed: number;
};
// spawnRadius 51 (playtest 2026-07-12: arena grown 1.5× from 34 — softer wave
// pacing via the longer approach, and a larger lit field under the vignette)
export const ARENA = { spawnRadius: 51, killRadius: 1.6 } as const;

/** The word an enemy is currently being typed against (`words[wordIndex]`). */
export function currentWord(e: EnemyState): string {
	return e.words[e.wordIndex];
}

export function createInitialState(seed: number): GameState {
	return {
		tick: 0,
		status: "running",
		rngState: createRngState(seed),
		score: 0,
		kills: 0,
		misses: 0,
		hits: 0,
		absorbs: 0,
		playerHp: 3,
		targetId: null,
		nextEnemyId: 1,
		enemies: [],
		wave: 0,
		wavePhase: "intermission",
		waveKind: "normal",
		lastSwarmWave: 0,
		spawnQueueRemaining: 0,
		spawnCooldown: 0,
		intermissionTicksLeft: 60,
		combo: 0,
		comboTicksLeft: 0,
		maxPlayerHp: 3,
		freezeTicksLeft: 0,
		slowTicksLeft: 0,
		targetPowerupId: null,
		powerups: [],
		nextPowerupId: 1,
		lastPowerupMilestone: 0,
		powerupsUsed: 0,
	};
}
