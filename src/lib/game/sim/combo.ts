import type { GameState } from "./state";

/**
 * The kill streak: gain on a kill, decay one tick at a time, break on a miss.
 * The HUD reads its fraction and multiplier from here so it can never drift
 * from the sim's own window.
 */
export const COMBO_DECAY_TICKS = 180;
const ADRENALINE_MULT = 1.5;

export function comboMultiplier(combo: number): number {
	return 1 + Math.min(4, Math.floor(combo / 5));
}

/** Decay window in ticks (adrenaline widens it x1.5, floored). */
export function comboWindow(s: GameState): number {
	// reads perks directly: importing hasPerk would cycle perks -> score -> combo
	return s.perks.includes("adrenaline")
		? Math.floor(COMBO_DECAY_TICKS * ADRENALINE_MULT)
		: COMBO_DECAY_TICKS;
}

export function gainCombo(s: GameState): void {
	s.combo += 1;
	s.comboTicksLeft = comboWindow(s);
}

export function decayCombo(s: GameState): void {
	if (s.comboTicksLeft > 0) {
		s.comboTicksLeft -= 1;
		if (s.comboTicksLeft === 0) s.combo = 0;
	}
}

export function breakCombo(s: GameState): void {
	s.combo = 0;
	s.comboTicksLeft = 0;
}

/** Share of the decay window still left, in [0, 1]. */
export function comboFraction(s: GameState): number {
	return Math.min(1, s.comboTicksLeft / comboWindow(s));
}
