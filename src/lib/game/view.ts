import { ARENA } from "./sim/state";

/**
 * Shared view constants/math between the Babylon scene and the Solid shell.
 * MUST stay free of Babylon imports — the shell uses it inside the main bundle
 * while the render chunk stays lazy.
 */

// world half-HEIGHT the ortho camera frames (see render/scene.ts applyOrtho);
// half-width follows the viewport aspect so world cells stay square on screen
export const ORTHO_HALF = 38;

// Vignette bands in world units, anchored to the sim's spawn ring. Enemies
// spawn at ARENA.spawnRadius, which on wide viewports sits INSIDE the visible
// frame — the vignette hides the ring behind near-opaque darkness so enemies
// emerge from the dark instead of popping into existence. Powerups (radius ≤
// spawnRadius/2) stay in the clear zone.
const DARK_RADIUS = ARENA.spawnRadius - 4; // near-opaque before the spawn ring
const DIM_RADIUS = DARK_RADIUS - 8; // mid fade — approaching enemies readable
const CLEAR_RADIUS = DARK_RADIUS - 19; // fully transparent out to here

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
