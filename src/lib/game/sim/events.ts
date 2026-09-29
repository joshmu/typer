import type { PowerupKind } from "./state";

export type KillCause = "typed" | "weapon" | "bomb";

/**
 * A fact the sim reports about a tick, pushed into the optional sink passed to
 * `step()`. Not part of GameState and never hashed. Enemy events carry the
 * position at the moment they happened, since a killed enemy is pruned by the
 * end of the tick.
 */
export type SimEvent =
	// a shot landed on an enemy that survived it; `typed` is a player keystroke,
	// otherwise weapon-perk damage
	| {
			type: "hit";
			id: number;
			x: number;
			y: number;
			typed: boolean;
			damaged: boolean;
	  }
	| { type: "absorb"; id: number; x: number; y: number; typed: boolean }
	| {
			type: "kill";
			id: number;
			x: number;
			y: number;
			archetypeId: string;
			cause: KillCause;
	  }
	| { type: "breach"; id: number; x: number; y: number }
	| { type: "powerup"; kind: PowerupKind };
