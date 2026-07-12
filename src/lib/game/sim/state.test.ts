import { describe, expect, it } from "vitest";
import { createInitialState } from "./state";

describe("createInitialState", () => {
	it("starts clean and deterministic", () => {
		const s = createInitialState(42);
		expect(s.tick).toBe(0);
		expect(s.status).toBe("running");
		expect(s.playerHp).toBe(3);
		expect(s.enemies).toEqual([]);
		expect(s.targetId).toBeNull();
		expect(s.wave).toBe(0);
		expect(s.wavePhase).toBe("intermission");
		expect(s.intermissionTicksLeft).toBe(60);
		expect(s.lastPowerupMilestone).toBe(0);
		expect(s.powerupsUsed).toBe(0);
		expect(s.absorbs).toBe(0);
		expect(createInitialState(42)).toEqual(s);
	});
});
