import english1k from "@/lib/core/text/data/english-1k.json";
import english5k from "@/lib/core/text/data/english-5k.json";
import { nextInt } from "../sim/rng";

export type Tier = 1 | 2 | 3 | 4;

const ONE_K = english1k as string[];
const FIVE_K = english5k as string[];

function band(source: string[], lo: number, hi: number): string[] {
	return source.filter((w) => w.length >= lo && w.length <= hi);
}

const BANDS: Record<Tier, string[]> = {
	1: band(ONE_K, 3, 4),
	2: band(ONE_K, 5, 6),
	3: band(FIVE_K, 6, 8),
	4: band(FIVE_K, 8, 12),
};

export function pickWordForTier(
	tier: Tier,
	rngState: number,
	excludeInitials: ReadonlySet<string>,
): [word: string, next: number] {
	const pool = BANDS[tier];
	const filtered = pool.filter((w) => !excludeInitials.has(w[0]));
	const usable = filtered.length > 0 ? filtered : pool;
	const [i, next] = nextInt(rngState, usable.length);
	return [usable[i], next];
}

export function pickWord(
	rngState: number,
	excludeInitials: ReadonlySet<string>,
): [word: string, next: number] {
	return pickWordForTier(1, rngState, excludeInitials);
}
