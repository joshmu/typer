import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type InputLog, runReplay, stateHash } from "./replay";
import { createInitialState } from "./state";
import { step } from "./step";

const FIXTURE_DIR = join(
	process.cwd(),
	"src",
	"lib",
	"game",
	"sim",
	"__fixtures__",
);

/**
 * Build a deterministic "type the first enemy to death" log by probing the
 * sim: advance untyped until an enemy is alive, read its word, then script
 * the keystrokes. Because the sim is a pure deterministic fold, replaying
 * this log from scratch reproduces the exact same enemy and word.
 */
function buildFirstKillLog(seed: number): InputLog {
	let s = createInitialState(seed);
	let tick = 0;
	while (s.enemies.filter((e) => e.alive).length === 0 && tick < 4000) {
		s = step(s, []);
		tick = s.tick;
	}
	const enemy = s.enemies.find((e) => e.alive);
	const word = enemy ? enemy.word : "";
	const events = [...word].map((key, i) => ({ tick: tick + 1 + i, key }));
	return { seed, ticks: tick + word.length + 30, events };
}

describe("replay", () => {
	it("replays a probed kill deterministically", () => {
		const log = buildFirstKillLog(42);
		const a = runReplay(log);
		const b = runReplay(log);
		expect(a.kills).toBeGreaterThanOrEqual(1);
		expect(stateHash(a)).toBe(stateHash(b));
	});

	it("hash changes when the seed changes", () => {
		const base: InputLog = { seed: 42, ticks: 600, events: [] };
		const other: InputLog = { seed: 43, ticks: 600, events: [] };
		expect(stateHash(runReplay(base))).not.toBe(stateHash(runReplay(other)));
	});

	it("matches the golden fixture hash", async () => {
		const fixture = await import("./__fixtures__/replay-first-kill.json");
		const result = runReplay(fixture.log as InputLog);
		expect(stateHash(result)).toBe(fixture.expectedHash);
		expect(result.kills).toBe(fixture.expectedKills);
	});

	// Env-guarded: regenerates the committed fixture from the current sim.
	// Run: RECORD_FIXTURE=1 pnpm test:run -- src/lib/game/sim/replay.test.ts
	it("[record] regenerate golden fixture", () => {
		if (!process.env.RECORD_FIXTURE) return;
		const log = buildFirstKillLog(42);
		const result = runReplay(log);
		const fixture = {
			log,
			expectedHash: stateHash(result),
			expectedKills: result.kills,
		};
		writeFileSync(
			join(FIXTURE_DIR, "replay-first-kill.json"),
			`${JSON.stringify(fixture, null, "\t")}\n`,
		);
	});
});
