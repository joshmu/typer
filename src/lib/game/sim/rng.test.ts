import { describe, expect, it } from "vitest";
import { createRngState, nextFloat, nextInt } from "./rng";

describe("rng", () => {
	it("is deterministic for a seed", () => {
		let a = createRngState(42);
		let b = createRngState(42);
		for (let i = 0; i < 100; i++) {
			const [va, na] = nextFloat(a);
			const [vb, nb] = nextFloat(b);
			expect(va).toBe(vb);
			a = na;
			b = nb;
		}
	});

	it("differs across seeds", () => {
		expect(nextFloat(createRngState(1))[0]).not.toBe(
			nextFloat(createRngState(2))[0],
		);
	});

	it("nextFloat stays in [0,1)", () => {
		let s = createRngState(7);
		for (let i = 0; i < 1000; i++) {
			const [v, n] = nextFloat(s);
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(1);
			s = n;
		}
	});

	it("nextInt stays in range and advances state", () => {
		let s = createRngState(9);
		for (let i = 0; i < 1000; i++) {
			const [v, n] = nextInt(s, 5);
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(5);
			expect(n).not.toBe(s);
			s = n;
		}
	});
});
