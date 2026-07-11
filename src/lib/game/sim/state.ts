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
	// completion = one damage. `wordIndex` is the current word; `typedCount` is the
	// progress within it. Shield/armored absorbs advance `wordIndex` and append a
	// fresh band word, so the chain never runs out while the enemy is alive.
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
	playerHp: number;
	targetId: number | null;
	nextEnemyId: number;
	enemies: EnemyState[];
	wave: number;
	wavePhase: "intermission" | "active";
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
export const ARENA = { spawnRadius: 34, killRadius: 1.6 } as const;

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
		playerHp: 3,
		targetId: null,
		nextEnemyId: 1,
		enemies: [],
		wave: 0,
		wavePhase: "intermission",
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
