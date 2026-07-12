/**
 * Shared view constants/math between the Babylon scene and the Solid shell.
 * MUST stay free of Babylon imports — the shell uses it inside the main bundle
 * while the render chunk stays lazy.
 */

// world half-HEIGHT the ortho camera frames (see render/scene.ts applyOrtho);
// half-width follows the viewport aspect so world cells stay square on screen
export const ORTHO_HALF = 38;

// Vignette bands in world units. Enemies spawn at ARENA.spawnRadius (34) which
// on wide viewports sits well INSIDE the visible frame — the vignette hides the
// ring behind near-opaque darkness so enemies emerge from the dark instead of
// popping into existence. Powerups (radius ≤ 17) stay in the clear zone.
const CLEAR_RADIUS = 19; // fully transparent out to here
const DIM_RADIUS = 26; // mid fade — approaching enemies become readable
const DARK_RADIUS = 31; // near-opaque before the 34-unit spawn ring

/**
 * Screen-space radial gradient for the darkness vignette, sized from the live
 * canvas CSS height (the ortho frame always shows 2×ORTHO_HALF world units
 * vertically, so px-per-unit = height / (2×ORTHO_HALF) on both axes — cells
 * are square). Returns "none" until the shell has measured a real height.
 */
export function vignetteGradient(cssHeight: number): string {
	if (!Number.isFinite(cssHeight) || cssHeight <= 0) return "none";
	const ppu = cssHeight / (2 * ORTHO_HALF);
	const clear = Math.round(CLEAR_RADIUS * ppu);
	const dim = Math.round(DIM_RADIUS * ppu);
	const dark = Math.round(DARK_RADIUS * ppu);
	return `radial-gradient(circle at center, transparent ${clear}px, rgba(3, 4, 8, 0.55) ${dim}px, rgba(3, 4, 8, 0.97) ${dark}px)`;
}
