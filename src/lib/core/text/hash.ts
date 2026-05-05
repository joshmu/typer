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
