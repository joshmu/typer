import { describe, expect, it } from "vitest";
import { runReplay, stateHash } from "./replay";
import { createInitialState } from "./state";
import { SPAWN_INTERVAL_TICKS, step } from "./step";

describe("replay", () => {
	it("replays a scripted kill deterministically", () => {
		// derive the word the first spawned enemy will carry
		let probe = createInitialState(42);
		for (let i = 0; i <= SPAWN_INTERVAL_TICKS; i++) probe = step(probe, []);
		const word = probe.enemies[0].word;

		const start = SPAWN_INTERVAL_TICKS + 2;
		const log = {
			seed: 42,
			ticks: start + word.length + 10,
			events: [...word].map((key, i) => ({ tick: start + i, key })),
		};
		const a = runReplay(log);
		const b = runReplay(log);
		expect(a.kills).toBe(1);
		expect(stateHash(a)).toBe(stateHash(b));
	});

	it("hash changes when outcome changes", () => {
		const base = { seed: 42, ticks: 300, events: [] };
		const other = { seed: 43, ticks: 300, events: [] };
		expect(stateHash(runReplay(base))).not.toBe(stateHash(runReplay(other)));
	});

	it("matches the golden fixture hash", async () => {
		const fixture = await import("./__fixtures__/replay-first-kill.json");
		const result = runReplay(fixture.log);
		expect(stateHash(result)).toBe(fixture.expectedHash);
		expect(result.kills).toBe(fixture.expectedKills);
	});
});
