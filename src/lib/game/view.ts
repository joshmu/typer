/**
 * Shared view constants/math between the Babylon scene and the Solid shell.
 * MUST stay free of Babylon imports: the shell uses it inside the main bundle
 * while the render chunk stays lazy.
 */
import { ARENA } from "./sim/state";

// world half-HEIGHT the ortho camera frames on a landscape canvas. At 1440x900
// that is ~13 CSS px per world unit: two thirds of a top/bottom approach and
// all of a side approach are on screen, with the spawn ring just past the
// top and bottom edges.
export const ORTHO_HALF = 34;
// CSS px per world unit on the 1440x900 reference canvas
export const REF_PPU = 900 / (2 * ORTHO_HALF);
// a portrait canvas widens until the short axis shows at least this much, so
// enemies walking in from the sides still get some warning
const PORTRAIT_MIN_HALF_W = 20;

export type Frame = {
	/** world half-extents the ortho camera shows */
	halfW: number;
	halfH: number;
	/** CSS px per world unit (cells are square) */
	ppu: number;
};

function measured(n: number): boolean {
	return Number.isFinite(n) && n > 0;
}

/** The world window the camera frames for a canvas of the given CSS size. */
export function frameFor(cssW: number, cssH: number): Frame {
	if (!measured(cssW) || !measured(cssH)) {
		return { halfW: ORTHO_HALF, halfH: ORTHO_HALF, ppu: REF_PPU };
	}
	const aspect = cssW / cssH;
	let halfH = ORTHO_HALF;
	let halfW = ORTHO_HALF * aspect;
	if (halfW < PORTRAIT_MIN_HALF_W) {
		halfW = PORTRAIT_MIN_HALF_W;
		halfH = halfW / aspect;
	}
	return { halfW, halfH, ppu: cssH / (2 * halfH) };
}

// idle word plate glyph height on the reference canvas
const PLATE_FONT_REF = 20;

/**
 * On-screen CSS px for an idle word plate's text. Plates are UI, so they keep
 * a readable size whatever the camera zoom: 20px on the reference canvas,
 * scaling gently with the short side and clamped to [14, 24].
 */
export function plateFontPx(cssW: number, cssH: number): number {
	if (!measured(cssW) || !measured(cssH)) return PLATE_FONT_REF;
	const short = Math.min(cssW, cssH);
	const px = PLATE_FONT_REF * Math.sqrt(short / 900);
	return Math.min(24, Math.max(14, Math.round(px * 2) / 2));
}

// world units over which a fresh spawn fades in from the spawn ring
const SPAWN_FADE_BAND = 3;

/** Render-only alpha for an enemy at distance `dist` from the core, so spawns
 * that land inside a wide frame emerge instead of popping in. */
export function spawnFade(dist: number): number {
	const t = (ARENA.spawnRadius - dist) / SPAWN_FADE_BAND;
	return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

// vignette ink: a deep blue-black so the edges read as space, not a mask
const VIGNETTE_RGB = "3, 4, 10";
// [position along the corner ellipse, alpha]. The top/bottom edge midpoints
// sit at ~71% of the ellipse, so the play area stays almost clear and only
// the corners reach the 0.5 cap.
const VIGNETTE_STOPS: readonly [number, number][] = [
	[0, 0],
	[55, 0],
	[72, 0.18],
	[86, 0.34],
	[100, 0.5],
];

/**
 * Elliptical darkness that frames the arena: an ellipse with the shell's
 * aspect whose edge passes through the corners, clear over the play area and
 * capped at alpha 0.5. Returns "none" until the shell has a measured size.
 */
export function vignetteGradient(cssW: number, cssH: number): string {
	if (!measured(cssW) || !measured(cssH)) return "none";
	const rx = Math.ceil((cssW / 2) * Math.SQRT2);
	const ry = Math.ceil((cssH / 2) * Math.SQRT2);
	const stops = VIGNETTE_STOPS.map(
		([at, a]) => `rgba(${VIGNETTE_RGB}, ${a}) ${at}%`,
	).join(", ");
	return `radial-gradient(ellipse ${rx}px ${ry}px at center, ${stops})`;
}

function luminance(hex: string): number | null {
	const m = hex.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
	if (!m) return null;
	const h =
		m[1].length === 3
			? m[1]
					.split("")
					.map((c) => c + c)
					.join("")
			: m[1];
	const lin = [0, 2, 4].map((i) => {
		const c = Number.parseInt(h.slice(i, i + 2), 16) / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/**
 * The theme's bg/text pair arranged for the always-dark arena: the darker of
 * the two fills word plates and HUD panels, the lighter is the ink. A dark
 * theme keeps its pairing; a light theme is inverted, never dark-on-dark.
 */
export function arenaInk(
	bg: string,
	text: string,
): { plate: string; ink: string } {
	const lb = luminance(bg);
	const lt = luminance(text);
	if (lb === null || lt === null) return { plate: "#101218", ink: "#e6e6e6" };
	const b = bg.trim();
	const t = text.trim();
	return lb <= lt ? { plate: b, ink: t } : { plate: t, ink: b };
}
