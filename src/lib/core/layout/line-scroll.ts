/**
 * Scroll offset for the typing window: keeps the active line on the second
 * visible row and moves in whole line heights, measured from the first
 * line's top so the inline box inset never leaks into the offset.
 */
export function lineScrollOffset(
	wordTop: number,
	firstTop: number,
	lineHeight: number,
	current: number,
): number {
	const line = Math.round((wordTop - firstTop) / lineHeight);
	const target = Math.max(0, line - 1) * lineHeight;
	return target > current ? target : current;
}
