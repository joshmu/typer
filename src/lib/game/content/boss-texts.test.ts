import { describe, expect, it } from "vitest";
import { createRngState } from "../sim/rng";
import { BOSS_TEXTS, pickBossText } from "./boss-texts";

describe("boss sentence passages", () => {
	it("ships at least 15 passages", () => {
		expect(BOSS_TEXTS.length).toBeGreaterThanOrEqual(15);
	});

	it("stores each passage pre-split into 15-25 normalized words", () => {
		for (const passage of BOSS_TEXTS) {
			expect(passage.length).toBeGreaterThanOrEqual(15);
			expect(passage.length).toBeLessThanOrEqual(25);
		}
	});

	it("every word is lowercase ascii letters only", () => {
		for (const passage of BOSS_TEXTS) {
			for (const word of passage) {
				expect(word).toMatch(/^[a-z]+$/);
			}
		}
	});

	it("draws first-word initials from a diverse set (uniqueness filter has room)", () => {
		const initials = new Set(BOSS_TEXTS.map((p) => p[0][0]));
		expect(initials.size).toBeGreaterThanOrEqual(8);
	});

	describe("pickBossText", () => {
		it("is deterministic for a given rng state", () => {
			const [a, na] = pickBossText(createRngState(7), new Set());
			const [b, nb] = pickBossText(createRngState(7), new Set());
			expect(a).toEqual(b);
			expect(na).toBe(nb);
		});

		it("returns a passage that is one of BOSS_TEXTS, in order", () => {
			const [passage] = pickBossText(createRngState(3), new Set());
			expect(BOSS_TEXTS).toContainEqual(passage);
		});

		it("avoids passages whose first initial is live when alternatives exist", () => {
			// exclude every initial but one → the pick must land on a survivor
			const survivorInitial = BOSS_TEXTS.find(
				(p) => BOSS_TEXTS.filter((q) => q[0][0] === p[0][0]).length > 0,
			)?.[0][0] as string;
			const exclude = new Set(
				BOSS_TEXTS.map((p) => p[0][0]).filter((i) => i !== survivorInitial),
			);
			for (let seed = 0; seed < 50; seed++) {
				const [passage] = pickBossText(createRngState(seed), exclude);
				expect(passage[0][0]).toBe(survivorInitial);
			}
		});

		it("falls back to the full set when every initial is excluded", () => {
			const exclude = new Set(BOSS_TEXTS.map((p) => p[0][0]));
			const [passage] = pickBossText(createRngState(1), exclude);
			expect(BOSS_TEXTS).toContainEqual(passage);
		});
	});
});
