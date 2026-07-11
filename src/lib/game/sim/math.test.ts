import { describe, expect, it } from "vitest";
import { cosR, dist, randomPointOnCircle, sinR } from "./math";
import { createRngState } from "./rng";

describe("dist", () => {
	it("equals the manual sqrt of the sum of squares", () => {
		expect(dist(3, 4)).toBe(Math.sqrt(3 * 3 + 4 * 4));
		expect(dist(3, 4)).toBe(5);
		expect(dist(0, 0)).toBe(0);
		expect(dist(-6, 8)).toBe(10);
	});
});

describe("sinR / cosR", () => {
	it("approximates Math.sin within 2e-3 across [-10π, 10π]", () => {
		for (let i = -1000; i <= 1000; i++) {
			const x = (i / 1000) * 10 * Math.PI;
			expect(Math.abs(sinR(x) - Math.sin(x))).toBeLessThan(2e-3);
		}
	});

	it("approximates Math.cos within 2e-3 across [-10π, 10π]", () => {
		for (let i = -1000; i <= 1000; i++) {
			const x = (i / 1000) * 10 * Math.PI;
			expect(Math.abs(cosR(x) - Math.cos(x))).toBeLessThan(2e-3);
		}
	});

	it("is deterministic", () => {
		expect(sinR(1.234)).toBe(sinR(1.234));
		expect(cosR(1.234)).toBe(cosR(1.234));
	});
});

describe("randomPointOnCircle", () => {
	it("places the point exactly on the circle of the given radius", () => {
		for (let seed = 0; seed < 8; seed++) {
			const [pos] = randomPointOnCircle(createRngState(seed), 20);
			const d = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
			expect(Math.abs(d - 20)).toBeLessThan(1e-9);
		}
	});

	it("is deterministic and advances the rng state", () => {
		const [a, na] = randomPointOnCircle(createRngState(3), 20);
		const [b, nb] = randomPointOnCircle(createRngState(3), 20);
		expect(a).toEqual(b);
		expect(na).toBe(nb);
		expect(na).not.toBe(createRngState(3));
	});
});
