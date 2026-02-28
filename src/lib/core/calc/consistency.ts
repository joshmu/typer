/**
 * Calculate typing consistency as a percentage.
 * Uses coefficient of variation (CV = stddev / mean).
 * 100% = perfectly consistent, 0% = maximally inconsistent.
 */
export function calculateConsistency(perSecondWPM: number[]): number {
	if (perSecondWPM.length <= 1) return 100;

	const mean =
		perSecondWPM.reduce((sum, v) => sum + v, 0) / perSecondWPM.length;
	if (mean === 0) return 100;

	const variance =
		perSecondWPM.reduce((sum, v) => sum + (v - mean) ** 2, 0) /
		perSecondWPM.length;
	const stddev = Math.sqrt(variance);
	const cv = stddev / mean;

	// Convert CV to a 0-100 score where 0 CV = 100%
	return Math.round(Math.max(0, (1 - cv) * 100));
}
