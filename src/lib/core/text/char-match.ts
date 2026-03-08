/**
 * Compare a typed character against an expected character,
 * allowing diacritics to match their base character.
 *
 * Uses Unicode NFD decomposition: "ž" → "z" + combining caron.
 * Taking [0] gives the base character "z", which matches typed "z".
 * Case is preserved: "Ž" decomposes to "Z" + caron, matching only "Z".
 */
export function isCharMatch(typed: string, expected: string): boolean {
	if (typed === expected) return true;
	const expectedNFD = expected.normalize("NFD");
	// If NFD didn't change anything, no diacritical mark to strip
	if (expectedNFD === expected) return false;
	return typed === expectedNFD[0];
}
