/**
 * Mulberry32 PRNG in pure-functional form. State is a 32-bit integer;
 * every draw returns the value AND the next state so the simulation
 * stays a pure fold (required for deterministic replay).
 */
export function createRngState(seed: number): number {
	return seed >>> 0;
}

export function nextFloat(state: number): [value: number, next: number] {
	let t = (state + 0x6d2b79f5) >>> 0;
	const next = t;
	t = Math.imul(t ^ (t >>> 15), t | 1);
	t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
	const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	return [value, next];
}

export function nextInt(
	state: number,
	maxExclusive: number,
): [value: number, next: number] {
	const [f, next] = nextFloat(state);
	return [Math.floor(f * maxExclusive), next];
}
