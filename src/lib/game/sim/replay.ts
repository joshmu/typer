import { fnv1a } from "@/lib/core/text/hash";
import { createInitialState, type GameState } from "./state";
import { type GameEvent, step } from "./step";

export type InputLog = {
	seed: number;
	ticks: number;
	events: { tick: number; key: string }[];
};

export function runReplay(log: InputLog): GameState {
	let state = createInitialState(log.seed);
	for (let t = 1; t <= log.ticks; t++) {
		const events: GameEvent[] = log.events
			.filter((e) => e.tick === t)
			.map((e) => ({ type: "key", key: e.key }));
		state = step(state, events);
	}
	return state;
}

/** FNV-1a over the canonical JSON of the state. Sim state is built with a
 * fixed key order, so JSON.stringify is stable across runs and engines. */
export function stateHash(state: GameState): string {
	return fnv1a(JSON.stringify(state));
}
