import { describe, expect, it } from "vitest";
import { getArchetype } from "../content/enemies";
import { createEnemy } from "./enemy-factory";
import { dist } from "./math";
import { applyKnockback, PHYS, separate, steer } from "./physics";
import type { EnemyState } from "./state";

function enemy(archetypeId: string, x: number, y: number): EnemyState {
	const arch = getArchetype(archetypeId);
	return createEnemy(arch, 1, { x, y }, 0, ["word"]);
}

describe("physics", () => {
	it("steer moves velocity toward the desired vector but never faster than accel", () => {
		const e = enemy("husk-1", 10, 0);
		e.vel = { x: 0.03, y: 0 };
		// desired is a hard reversal
		steer(e, { x: -0.03, y: 0 });
		// one tick can only bend velocity by `accel`, so it cannot flip sign
		expect(e.vel.x).toBeGreaterThan(0);
		const delta = dist(e.vel.x - 0.03, e.vel.y - 0);
		expect(delta).toBeLessThanOrEqual(PHYS.accel + 1e-9);
	});

	it("steer snaps to the desired vector once within an accel step", () => {
		const e = enemy("husk-1", 10, 0);
		e.vel = { x: 0.02, y: 0 };
		const desired = { x: 0.02 + PHYS.accel * 0.5, y: 0 };
		steer(e, desired);
		expect(e.vel.x).toBeCloseTo(desired.x, 12);
		expect(e.vel.y).toBeCloseTo(desired.y, 12);
	});

	it("velocity is continuous across many steers (no instant reversal)", () => {
		const e = enemy("husk-1", 10, 0);
		e.vel = { x: 0.04, y: 0 };
		// desired flips every tick; velocity must not teleport past its accel budget
		for (let t = 0; t < 5; t++) {
			const prev = { x: e.vel.x, y: e.vel.y };
			steer(e, { x: t % 2 === 0 ? -0.04 : 0.04, y: 0 });
			expect(dist(e.vel.x - prev.x, e.vel.y - prev.y)).toBeLessThanOrEqual(
				PHYS.accel + 1e-9,
			);
		}
	});

	it("separate pushes two overlapping same-size enemies apart", () => {
		const a = enemy("husk-1", 0, 0);
		a.id = 1;
		const b = enemy("husk-1", 0.1, 0); // heavily overlapping
		b.id = 2;
		separate([a, b]);
		// a is nudged toward -x, b toward +x (away from each other)
		expect(a.vel.x).toBeLessThan(0);
		expect(b.vel.x).toBeGreaterThan(0);
	});

	it("separation settles overlapping enemies to a non-overlapping spacing", () => {
		const a = enemy("husk-1", 0, 0);
		a.id = 1;
		const b = enemy("husk-1", 0.05, 0);
		b.id = 2;
		const size = getArchetype("husk-1").size;
		const combined = size + size;
		// run separate + integrate for 60 ticks (no other desired movement)
		for (let t = 0; t < 60; t++) {
			a.vel = { x: 0, y: 0 };
			b.vel = { x: 0, y: 0 };
			separate([a, b]);
			a.pos.x += a.vel.x;
			a.pos.y += a.vel.y;
			b.pos.x += b.vel.x;
			b.pos.y += b.vel.y;
		}
		const d = dist(a.pos.x - b.pos.x, a.pos.y - b.pos.y);
		expect(d).toBeGreaterThanOrEqual(combined * 0.45);
	});

	it("separate leaves well-spaced enemies untouched", () => {
		const a = enemy("husk-1", 0, 0);
		a.id = 1;
		const b = enemy("husk-1", 10, 0);
		b.id = 2;
		separate([a, b]);
		expect(a.vel.x).toBe(0);
		expect(b.vel.x).toBe(0);
	});

	it("applyKnockback shoves the target away from the source, net >= 1.5 over 30 ticks", () => {
		const e = enemy("husk-1", 5, 0);
		const start = dist(e.pos.x, e.pos.y);
		applyKnockback(e, { x: 0, y: 0 }); // pushed away from the core
		for (let t = 0; t < 30; t++) {
			// decay toward a resting (zero) desired, as the sim does post-knockback
			steer(e, { x: 0, y: 0 });
			e.pos.x += e.vel.x;
			e.pos.y += e.vel.y;
		}
		expect(dist(e.pos.x, e.pos.y) - start).toBeGreaterThanOrEqual(1.5);
	});

	it("knockback mult scales the impulse (bosses recoil less)", () => {
		const full = enemy("husk-1", 5, 0);
		const soft = enemy("husk-1", 5, 0);
		applyKnockback(full, { x: 0, y: 0 }, 1);
		applyKnockback(soft, { x: 0, y: 0 }, 0.4);
		expect(Math.abs(soft.vel.x)).toBeLessThan(Math.abs(full.vel.x));
	});
});
