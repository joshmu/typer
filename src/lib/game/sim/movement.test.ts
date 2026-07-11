import { describe, expect, it } from "vitest";
import { MOVEMENTS, noise2 } from "./movement";
import type { EnemyState } from "./state";

function enemy(partial: Partial<EnemyState>): EnemyState {
	return {
		id: 1,
		archetypeId: "grunt",
		pos: { x: 10, y: 0 },
		word: "the",
		typedCount: 0,
		hp: 1,
		maxHp: 1,
		alive: true,
		spawnTick: 0,
		speed: 0.05,
		tier: 1,
		movement: "chase",
		ability: null,
		abilityState: { shieldHits: 0, enraged: false },
		...partial,
	};
}

describe("noise2", () => {
	it("is deterministic per id + salt and stays in [0,1)", () => {
		expect(noise2(42, 0)).toBe(noise2(42, 0));
		expect(noise2(42, 0)).not.toBe(noise2(42, 1));
		for (let i = 0; i < 100; i++) {
			expect(noise2(42, i)).toBeGreaterThanOrEqual(0);
			expect(noise2(42, i)).toBeLessThan(1);
		}
	});
	it("differs across ids", () => {
		expect(noise2(1, 0)).not.toBe(noise2(2, 0));
	});
});

describe("movement behaviours", () => {
	it("chase moves straight toward the origin at speed", () => {
		const e = enemy({ pos: { x: 10, y: 0 }, speed: 0.05 });
		const v = MOVEMENTS.chase(e, 0);
		expect(v.x).toBeCloseTo(-0.05, 6);
		expect(v.y).toBeCloseTo(0, 6);
	});

	it("every behaviour reduces distance to the origin over time", () => {
		for (const id of Object.keys(MOVEMENTS) as (keyof typeof MOVEMENTS)[]) {
			let e = enemy({ id: 3, movement: id, pos: { x: 12, y: 4 } });
			const start = Math.hypot(e.pos.x, e.pos.y);
			for (let t = 0; t < 3000; t++) {
				const v = MOVEMENTS[id](e, t);
				e = { ...e, pos: { x: e.pos.x + v.x, y: e.pos.y + v.y } };
				if (Math.hypot(e.pos.x, e.pos.y) <= 1.2) break;
			}
			expect(Math.hypot(e.pos.x, e.pos.y)).toBeLessThan(start);
		}
	});

	it("returns a fresh vector without mutating the enemy", () => {
		const e = enemy({});
		const frozen = JSON.stringify(e);
		MOVEMENTS.spiral(e, 5);
		expect(JSON.stringify(e)).toBe(frozen);
	});
});
