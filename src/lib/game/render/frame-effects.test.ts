import { describe, expect, it } from "vitest";
import { comboMultiplier } from "../sim/combo";
import type { SimEvent } from "../sim/events";
import {
	dispatchEffects,
	type EffectCommands,
	killCredit,
} from "./frame-effects";

function recorder(): { calls: string[]; fx: EffectCommands } {
	const calls: string[] = [];
	return {
		calls,
		fx: {
			shot: (x, y, kind) => calls.push(`shot ${x},${y} ${kind}`),
			kill: (x, y, id, archetypeId) =>
				calls.push(`kill ${id} ${x},${y} ${archetypeId}`),
			spark: (x, y) => calls.push(`spark ${x},${y}`),
			breach: (x, y, id) => calls.push(`breach ${id} ${x},${y}`),
			coreHit: () => calls.push("coreHit"),
			powerupPulse: () => calls.push("powerupPulse"),
		},
	};
}

function run(events: SimEvent[]): string[] {
	const { calls, fx } = recorder();
	dispatchEffects(events, fx);
	return calls;
}

describe("dispatchEffects", () => {
	it("a typed keystroke fires a light shot; a typed chip a heavy one", () => {
		expect(
			run([{ type: "hit", id: 1, x: 1, y: 2, typed: true, damaged: false }]),
		).toEqual(["shot 1,2 light"]);
		expect(
			run([{ type: "hit", id: 1, x: 1, y: 2, typed: true, damaged: true }]),
		).toEqual(["shot 1,2 heavy"]);
	});

	it("never fires a shot for non-typed damage", () => {
		expect(
			run([
				{ type: "hit", id: 2, x: 3, y: 4, typed: false, damaged: true },
				{ type: "absorb", id: 3, x: 5, y: 6, typed: false },
				{
					type: "kill",
					id: 4,
					x: 7,
					y: 8,
					archetypeId: "husk-1",
					cause: "weapon",
				},
				{
					type: "kill",
					id: 5,
					x: 9,
					y: 0,
					archetypeId: "husk-1",
					cause: "bomb",
				},
			]),
		).toEqual(["spark 5,6", "kill 4 7,8 husk-1", "kill 5 9,0 husk-1"]);
	});

	it("a non-typed absorb sparks at the absorbing enemy", () => {
		expect(run([{ type: "absorb", id: 3, x: 5, y: 6, typed: false }])).toEqual([
			"spark 5,6",
		]);
	});

	it("two typed hits on one enemy in one frame fire one tracer, the heaviest", () => {
		expect(
			run([
				{ type: "hit", id: 1, x: 1, y: 2, typed: true, damaged: true },
				{ type: "hit", id: 1, x: 1, y: 3, typed: true, damaged: true },
			]),
		).toEqual(["shot 1,3 heavy"]);
		expect(
			run([
				{ type: "hit", id: 1, x: 1, y: 2, typed: true, damaged: true },
				{ type: "absorb", id: 1, x: 1, y: 2, typed: true },
			]),
		).toEqual(["shot 1,2 heavy"]);
	});

	it("a typed chip then kill on one enemy fires one shot before the kill", () => {
		expect(
			run([
				{ type: "hit", id: 1, x: 1, y: 2, typed: true, damaged: true },
				{
					type: "kill",
					id: 1,
					x: 1,
					y: 3,
					archetypeId: "husk-1",
					cause: "typed",
				},
			]),
		).toEqual(["shot 1,3 heavy", "kill 1 1,3 husk-1"]);
	});

	it("typed shots on different enemies in one frame each fire", () => {
		expect(
			run([
				{ type: "hit", id: 1, x: 1, y: 1, typed: true, damaged: true },
				{ type: "hit", id: 2, x: 2, y: 2, typed: true, damaged: false },
			]),
		).toEqual(["shot 1,1 heavy", "shot 2,2 light"]);
	});

	it("a typed kill fires a heavy shot at the victim before the kill", () => {
		expect(
			run([
				{
					type: "kill",
					id: 1,
					x: 1,
					y: 1,
					archetypeId: "husk-1",
					cause: "typed",
				},
			]),
		).toEqual(["shot 1,1 heavy", "kill 1 1,1 husk-1"]);
	});

	it("a typed absorb clangs at the absorbing enemy", () => {
		expect(run([{ type: "absorb", id: 7, x: 3, y: 3, typed: true }])).toEqual([
			"shot 3,3 clang",
		]);
	});

	it("breaches scar the ground and shake the core once per frame", () => {
		expect(
			run([
				{ type: "breach", id: 1, x: 0.5, y: 0 },
				{ type: "breach", id: 2, x: 0, y: 0.5 },
			]),
		).toEqual(["breach 1 0.5,0", "breach 2 0,0.5", "coreHit"]);
	});

	it("an applied powerup pulses the ring", () => {
		expect(run([{ type: "powerup", kind: "freeze" }])).toEqual([
			"powerupPulse",
		]);
	});
});

describe("killCredit", () => {
	const span = (before: number, after: number) => ({ before, after });

	it("splits the frame's score gain across its kills, the remainder on the last", () => {
		expect(killCredit(1, 40, span(0, 1), 0)).toEqual({ points: 40, mult: 1 });
		expect(killCredit(2, 101, span(0, 2), 0).points).toBe(50);
		expect(killCredit(2, 101, span(0, 2), 1).points).toBe(51);
	});

	it("credits each kill the multiplier its own streak earned", () => {
		// three kills this frame took the streak from 3 to 6: x1, x2, x2
		expect(killCredit(3, 90, span(3, 6), 0).mult).toBe(1);
		expect(killCredit(3, 90, span(3, 6), 1).mult).toBe(2);
		expect(killCredit(3, 90, span(3, 6), 2).mult).toBe(2);
	});

	it("credits a kill its streak when a miss broke the combo later in the frame", () => {
		// the fifth kill in a row (x2), then a miss before the draw
		const score = (streak: number) => 10 * 5 * comboMultiplier(streak);
		expect(killCredit(1, 100, span(4, 0), 0, score)).toEqual({
			points: 100,
			mult: 2,
		});
	});

	it("credits kill, miss, kill in one frame each its own streak", () => {
		const streak = (nth: number) =>
			killCredit(2, 0, span(4, 1), nth, (s) => s).points;
		expect([streak(0), streak(1)]).toEqual([5, 1]);
	});

	it("restarts the streak for kills after a break earlier in the frame", () => {
		const streak = (nth: number) =>
			killCredit(2, 0, span(3, 2), nth, (s) => s).points;
		expect([streak(0), streak(1)]).toEqual([1, 2]);
	});

	it("never credits negative points or a zero multiplier", () => {
		expect(killCredit(1, -5, span(0, 0), 0)).toEqual({ points: 0, mult: 1 });
	});

	it("credits each kill its own points when its word is known", () => {
		// a boss sentence word and an escort's short word die together
		const score = (len: number) => (streak: number) => 10 * len * streak;
		expect(killCredit(2, 999, span(3, 5), 0, score(9)).points).toBe(360);
		expect(killCredit(2, 999, span(3, 5), 1, score(3)).points).toBe(150);
	});
});
