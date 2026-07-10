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
	const json = JSON.stringify(state);
	let hash = 0x811c9dc5;
	for (let i = 0; i < json.length; i++) {
		hash ^= json.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16);
}
