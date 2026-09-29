import { comboMultiplier } from "./combo";

export function killScore(wordLength: number, combo: number): number {
	return 10 * wordLength * comboMultiplier(combo);
}
