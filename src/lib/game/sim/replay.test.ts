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

/**
 * A long deterministic run: play several waves, scripting a burst of the most
 * common letters each tick so combos, multi-hp reassignment and powerup typing
 * all fire. Purely to lock the sim's byte-for-byte determinism.
 */
function buildDeepRunLog(seed: number): InputLog {
	const letters = "etaoinshrdlucmfwypvbgkjqxz";
	const events: { tick: number; key: string }[] = [];
	for (let tick = 1; tick <= 2400; tick++) {
		const key = letters[tick % letters.length];
		events.push({ tick, key });
	}
	return { seed, ticks: 2400, events };
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

	it("deep run is deterministic across replays", () => {
		const log = buildDeepRunLog(42);
		expect(stateHash(runReplay(log))).toBe(stateHash(runReplay(log)));
	});

	it("matches the deep-run golden fixture", async () => {
		const fixture = await import("./__fixtures__/replay-deep-run.json");
		const result = runReplay(fixture.log as InputLog);
		expect(stateHash(result)).toBe(fixture.expectedHash);
		expect(result.wave).toBe(fixture.expectedWave);
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

	it("[record] regenerate deep-run fixture", () => {
		if (!process.env.RECORD_FIXTURE) return;
		const log = buildDeepRunLog(42);
		const result = runReplay(log);
		const fixture = {
			log,
			expectedHash: stateHash(result),
			expectedWave: result.wave,
		};
		writeFileSync(
			join(FIXTURE_DIR, "replay-deep-run.json"),
			`${JSON.stringify(fixture, null, "\t")}\n`,
		);
	});
});
