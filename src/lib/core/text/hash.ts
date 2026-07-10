/**
 * Stable, fast string hash used to fingerprint test text for persistence.
 * Not cryptographic — collisions are acceptable for the typing-result use
 * case, where the hash is only used to dedupe identical retries.
 */
export function simpleHash(str: string): string {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash |= 0;
	}
	return hash.toString(36);
}

/**
 * FNV-1a 32-bit hash rendered as an unsigned hex string. Uses only the
 * cross-engine-deterministic integer ops (`^`, `Math.imul`), so identical
 * input yields an identical fingerprint on every JS engine. Shared by the
 * game replay layer to fingerprint simulation state.
 */
export function fnv1a(str: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < str.length; i++) {
		hash ^= str.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16);
}
