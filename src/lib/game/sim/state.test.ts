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
		expect(createInitialState(42)).toEqual(s);
	});
});
