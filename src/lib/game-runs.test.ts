import "fake-indexeddb/auto";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { db, type GameRun } from "./db";
import { saveGameRun, useBestRun, useRecentRuns } from "./game-runs";

function run(overrides?: Partial<Omit<GameRun, "id">>): Omit<GameRun, "id"> {
	return {
		score: 1000,
		wave: 3,
		kills: 40,
		wpm: 55,
		accuracy: 92,
		durationSeconds: 120,
		seed: 42,
		timestamp: Date.now(),
		...overrides,
	};
}

/** Let a liveQuery subscription emit at least once. */
const tick = () => new Promise((r) => setTimeout(r, 60));

describe("game-runs persistence", () => {
	afterEach(async () => {
		await db.gameRuns.clear();
	});

	it("saves a run and returns its id", async () => {
		const id = await saveGameRun(run({ score: 2500 }));
		expect(id).toBeGreaterThan(0);

		const stored = await db.gameRuns.get(id);
		expect(stored).toMatchObject({ score: 2500 });
	});

	it("useBestRun emits the highest-scoring run", async () => {
		await saveGameRun(run({ score: 800 }));
		await saveGameRun(run({ score: 3200 }));
		await saveGameRun(run({ score: 1500 }));

		const best = await new Promise<GameRun | undefined>((resolve) =>
			createRoot(async (dispose) => {
				const acc = useBestRun();
				await tick();
				const value = acc();
				dispose();
				resolve(value);
			}),
		);

		expect(best?.score).toBe(3200);
	});

	it("useBestRun is undefined when no runs exist", async () => {
		const best = await new Promise<GameRun | undefined>((resolve) =>
			createRoot(async (dispose) => {
				const acc = useBestRun();
				await tick();
				const value = acc();
				dispose();
				resolve(value);
			}),
		);

		expect(best).toBeUndefined();
	});

	it("useRecentRuns returns newest first, respecting the limit", async () => {
		await saveGameRun(run({ timestamp: 1000, score: 10 }));
		await saveGameRun(run({ timestamp: 3000, score: 30 }));
		await saveGameRun(run({ timestamp: 2000, score: 20 }));

		const recent = await new Promise<GameRun[]>((resolve) =>
			createRoot(async (dispose) => {
				const acc = useRecentRuns(2);
				await tick();
				const value = acc();
				dispose();
				resolve(value);
			}),
		);

		expect(recent.map((r) => r.score)).toEqual([30, 20]);
	});
});
