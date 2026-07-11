export const COMBO_DECAY_TICKS = 180;

export function comboMultiplier(combo: number): number {
	return 1 + Math.min(4, Math.floor(combo / 5));
}

export function killScore(wordLength: number, combo: number): number {
	return 10 * wordLength * comboMultiplier(combo);
}
