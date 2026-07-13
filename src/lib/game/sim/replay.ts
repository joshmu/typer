import { fnv1a } from "@/lib/core/text/hash";
import { createInitialState, type GameState } from "./state";
import { type GameEvent, step } from "./step";

// A logged input is either a keystroke or a perk pick (roguelite draft). The perk
// variant serializes as `{ tick, perk }` so fixtures round-trip the new event type
// through plain JSON alongside the existing `{ tick, key }` keystrokes.
export type LoggedEvent =
	| { tick: number; key: string }
	| { tick: number; perk: number };

export type InputLog = {
	seed: number;
	ticks: number;
	events: LoggedEvent[];
};

export function runReplay(log: InputLog): GameState {
	for (const e of log.events) {
		if (e.tick < 1 || e.tick > log.ticks) {
			throw new Error(`Replay event tick ${e.tick} outside 1..${log.ticks}`);
		}
	}
	let state = createInitialState(log.seed);
	for (let t = 1; t <= log.ticks; t++) {
		const events: GameEvent[] = log.events
			.filter((e) => e.tick === t)
			.map(
				(e): GameEvent =>
					"perk" in e
						? { type: "perk", index: e.perk }
						: { type: "key", key: e.key },
			);
		state = step(state, events);
	}
	return state;
}

/** FNV-1a over the canonical JSON of the state. Sim state is built with a
 * fixed key order, so JSON.stringify is stable across runs and engines. */
export function stateHash(state: GameState): string {
	return fnv1a(JSON.stringify(state));
}
