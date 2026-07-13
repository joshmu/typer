import { describe, expect, it } from "vitest";
import { dist } from "./math";
import { MOVEMENTS, noise2 } from "./movement";
import type { EnemyState } from "./state";

function enemy(partial: Partial<EnemyState>): EnemyState {
	return {
		id: 1,
		archetypeId: "grunt",
		pos: { x: 10, y: 0 },
		vel: { x: 0, y: 0 },
		words: ["the"],
		wordIndex: 0,
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
		movePhase: 0,
		phaseTick: 0,
		...partial,
	};
}

/** Total absolute angle swept about the origin over `ticks`, integrating the
 * movement's desired velocity directly (as the family-coverage test does). Uses
 * Math.atan2 — legal in tests, never in sim/content sources. */
function angleSwept(
	movement: keyof typeof MOVEMENTS,
	ticks: number,
	start = { x: 12, y: 0 },
): number {
	let e = enemy({ id: 7, movement, pos: { ...start } });
	let prev = Math.atan2(e.pos.y, e.pos.x);
	let total = 0;
	for (let t = 0; t < ticks; t++) {
		const v = MOVEMENTS[movement](e, t);
		e = { ...e, pos: { x: e.pos.x + v.x, y: e.pos.y + v.y } };
		const a = Math.atan2(e.pos.y, e.pos.x);
		let d = a - prev;
		while (d > Math.PI) d -= Math.PI * 2;
		while (d < -Math.PI) d += Math.PI * 2;
		total += Math.abs(d);
		prev = a;
	}
	return total;
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

describe("spiral-fast movement", () => {
	it("sweeps ~3× the angular progress of spiral over the same ticks", () => {
		const base = angleSwept("spiral", 200);
		const fast = angleSwept("spiral-fast", 200);
		expect(base).toBeGreaterThan(0);
		const ratio = fast / base;
		expect(ratio).toBeGreaterThan(2.3);
		expect(ratio).toBeLessThan(3.7);
	});

	it("shrinks its radius steadily toward the core", () => {
		let e = enemy({ id: 7, movement: "spiral-fast", pos: { x: 14, y: 0 } });
		const start = dist(e.pos.x, e.pos.y);
		let prev = start;
		for (let t = 0; t < 300; t++) {
			const v = MOVEMENTS["spiral-fast"](e, t);
			e = { ...e, pos: { x: e.pos.x + v.x, y: e.pos.y + v.y } };
			const d = dist(e.pos.x, e.pos.y);
			// monotonically closing (allow a tiny epsilon for float noise)
			expect(d).toBeLessThanOrEqual(prev + 1e-9);
			prev = d;
		}
		expect(prev).toBeLessThan(start * 0.5);
	});

	it("stays stateless — never touches movePhase/phaseTick", () => {
		const e = enemy({ id: 7, movement: "spiral-fast", pos: { x: 14, y: 0 } });
		for (let t = 0; t < 50; t++) MOVEMENTS["spiral-fast"](e, t);
		expect(e.movePhase).toBe(0);
		expect(e.phaseTick).toBe(0);
	});
});

describe("feint movement (jump scare)", () => {
	// integrate the desired velocity directly (phase logic mutates movePhase/
	// phaseTick on the passed enemy); base speed 0.024 → sprint 0.072
	function run(steps: number, e: ReturnType<typeof enemy>) {
		for (let t = 0; t < steps; t++) {
			const v = MOVEMENTS.feint(e, t);
			e.pos.x += v.x;
			e.pos.y += v.y;
		}
		return e;
	}

	it("phase 0 sprints straight at the core at ×3 base speed", () => {
		const e = enemy({
			id: 5,
			movement: "feint",
			pos: { x: 40, y: 0 },
			speed: 0.024,
		});
		const v = MOVEMENTS.feint(e, 0);
		expect(v.x).toBeCloseTo(-0.072, 6);
		expect(v.y).toBeCloseTo(0, 6);
		expect(e.movePhase).toBe(0);
	});

	it("crosses distance 10 → phase 1, then retreats OUTWARD", () => {
		const e = enemy({
			id: 5,
			movement: "feint",
			pos: { x: 40, y: 0 },
			speed: 0.024,
		});
		run(1000, e); // long enough to cross into phase 1
		expect(e.movePhase).toBeGreaterThanOrEqual(1);
		// while in phase 1 the desired velocity points away from the core (+x here)
		if (e.movePhase === 1) {
			const v = MOVEMENTS.feint(e, 0);
			expect(v.x).toBeGreaterThan(0);
		}
	});

	it("retreats for ~90 ticks then creeps inward at ×0.4 base speed", () => {
		// place just inside the trigger so phase 1 begins on the first tick
		const e = enemy({
			id: 5,
			movement: "feint",
			pos: { x: 9.9, y: 0 },
			speed: 0.024,
		});
		let retreatTicks = 0;
		for (let t = 0; t < 200; t++) {
			const before = e.movePhase;
			const v = MOVEMENTS.feint(e, t);
			if (before <= 1 && e.movePhase === 1 && v.x > 0) retreatTicks += 1;
			e.pos.x += v.x;
			e.pos.y += v.y;
			if (e.movePhase === 2) break;
		}
		expect(retreatTicks).toBeGreaterThanOrEqual(85);
		expect(retreatTicks).toBeLessThanOrEqual(95);
		expect(e.movePhase).toBe(2);
		// phase 2 creep: inward at ×0.4 base speed
		const d = dist(e.pos.x, e.pos.y) || 1;
		const v = MOVEMENTS.feint(e, 0);
		const speed = dist(v.x, v.y);
		expect(speed).toBeCloseTo(0.024 * 0.4, 6);
		// pointing inward (toward origin)
		expect(v.x * (-e.pos.x / d) + v.y * (-e.pos.y / d)).toBeGreaterThan(0);
	});

	it("phases are one-way — knockback displacement never resets to phase 0", () => {
		const e = enemy({
			id: 5,
			movement: "feint",
			pos: { x: 9.9, y: 0 },
			speed: 0.024,
		});
		MOVEMENTS.feint(e, 0); // enter phase 1
		expect(e.movePhase).toBe(1);
		// simulate a hard knockback shoving it back out past the trigger distance
		e.pos.x = 45;
		for (let t = 0; t < 300; t++) {
			const v = MOVEMENTS.feint(e, t);
			e.pos.x += v.x;
			e.pos.y += v.y;
		}
		// it advanced forward (1→2) but never rewound to a fresh sprint
		expect(e.movePhase).toBeGreaterThanOrEqual(1);
	});
});
