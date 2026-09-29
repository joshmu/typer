import { describe, expect, it } from "vitest";
import {
	breakCombo,
	COMBO_DECAY_TICKS,
	comboFraction,
	comboMultiplier,
	comboWindow,
	decayCombo,
	gainCombo,
} from "./combo";
import type { PerkId } from "./perks";
import { createInitialState, type GameState } from "./state";

function withPerks(perks: PerkId[]): GameState {
	return { ...createInitialState(1), perks };
}

describe("combo", () => {
	it("multiplier ramps every 5 combo, capped at 5", () => {
		expect(comboMultiplier(0)).toBe(1);
		expect(comboMultiplier(1)).toBe(1);
		expect(comboMultiplier(5)).toBe(2);
		expect(comboMultiplier(10)).toBe(3);
		expect(comboMultiplier(100)).toBe(5);
	});

	it("adrenaline widens the decay window by 1.5, floored", () => {
		expect(comboWindow(withPerks([]))).toBe(COMBO_DECAY_TICKS);
		expect(comboWindow(withPerks(["adrenaline"]))).toBe(
			Math.floor(COMBO_DECAY_TICKS * 1.5),
		);
	});

	it("a gain bumps the streak and refills the window", () => {
		const s = withPerks([]);
		gainCombo(s);
		gainCombo(s);
		expect(s.combo).toBe(2);
		expect(s.comboTicksLeft).toBe(COMBO_DECAY_TICKS);
	});

	it("decay ends the streak when the window runs out", () => {
		const s = withPerks([]);
		s.combo = 3;
		s.comboTicksLeft = 2;
		decayCombo(s);
		expect(s.combo).toBe(3);
		decayCombo(s);
		expect(s.combo).toBe(0);
		expect(s.comboTicksLeft).toBe(0);
		decayCombo(s);
		expect(s.comboTicksLeft).toBe(0);
	});

	it("a break clears the streak and the window", () => {
		const s = withPerks([]);
		gainCombo(s);
		breakCombo(s);
		expect(s.combo).toBe(0);
		expect(s.comboTicksLeft).toBe(0);
	});

	it("fraction is measured against the perk-aware window", () => {
		const s = withPerks(["adrenaline"]);
		gainCombo(s);
		expect(comboFraction(s)).toBe(1);
		decayCombo(s);
		expect(comboFraction(s)).toBe(269 / 270);
	});

	it("fraction is 0 with no live combo", () => {
		expect(comboFraction(withPerks([]))).toBe(0);
	});
});
