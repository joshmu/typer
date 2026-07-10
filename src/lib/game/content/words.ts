import { top200 } from "@/lib/core/text/words";
import { nextInt } from "../sim/rng";

const POOL = top200.filter((w) => w.length >= 3 && w.length <= 6);

export function pickWord(
	rngState: number,
	excludeInitials: ReadonlySet<string>,
): [word: string, next: number] {
	const filtered = POOL.filter((w) => !excludeInitials.has(w[0]));
	const pool = filtered.length > 0 ? filtered : POOL;
	const [i, next] = nextInt(rngState, pool.length);
	return [pool[i], next];
}
