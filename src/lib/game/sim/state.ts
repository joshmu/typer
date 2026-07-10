import { createRngState } from "./rng";

export type Vec2 = { x: number; y: number };
export type EnemyState = {
	id: number;
	archetypeId: string;
	pos: Vec2;
	word: string;
	typedCount: number;
	hp: number;
	alive: boolean;
};
export type GameStatus = "running" | "gameover";
export type GameState = {
	tick: number;
	status: GameStatus;
	rngState: number;
	score: number;
	kills: number;
	misses: number;
	playerHp: number;
	targetId: number | null;
	nextEnemyId: number;
	enemies: EnemyState[];
};
export const ARENA = { spawnRadius: 20, killRadius: 1.2 } as const;

export function createInitialState(seed: number): GameState {
	return {
		tick: 0,
		status: "running",
		rngState: createRngState(seed),
		score: 0,
		kills: 0,
		misses: 0,
		playerHp: 3,
		targetId: null,
		nextEnemyId: 1,
		enemies: [],
	};
}
