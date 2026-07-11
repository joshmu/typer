/**
 * Pure visual recipes for enemy families. No Babylon imports — this is data plus
 * small pure helpers so it stays trivially unit-testable. Colors are [r, g, b] in
 * 0..1 (Babylon Color3 space). The render layer maps each recipe's `family` to a
 * sculpted multi-part mesh builder (see enemy-models.ts).
 *
 * Families are derived from the roster ids in ../content/enemies.ts: each id is
 * `${family}-${tier}` (e.g. "husk-3"), bosses are `boss-*`. `visualFor` does a
 * longest-prefix match so any future tier lands on its family automatically.
 */
import type { PowerupKind } from "../sim/state";

export type FamilyVisual = {
	family: string;
	color: [number, number, number];
	emissive: [number, number, number];
};

// One recipe per roster family + boss + fallback. Hues are spread so families
// read as distinct at a glance; bosses carry the highest emissive.
export const FAMILY_VISUALS: FamilyVisual[] = [
	{
		family: "husk",
		color: [0.85, 0.25, 0.3],
		emissive: [0.3, 0.05, 0.06],
	},
	{
		family: "darter",
		color: [0.95, 0.6, 0.15],
		emissive: [0.35, 0.18, 0.03],
	},
	{
		family: "wraith",
		color: [0.6, 0.35, 0.95],
		emissive: [0.2, 0.1, 0.35],
	},
	{
		family: "charger",
		color: [0.35, 0.85, 0.4],
		emissive: [0.08, 0.3, 0.1],
	},
	{
		family: "weaver",
		color: [0.3, 0.8, 0.9],
		emissive: [0.06, 0.28, 0.32],
	},
	{
		family: "brood",
		color: [0.95, 0.35, 0.7],
		emissive: [0.35, 0.08, 0.22],
	},
	{
		family: "boss",
		color: [1, 0.85, 0.2],
		emissive: [0.6, 0.45, 0.1],
	},
];

export const FALLBACK_VISUAL: FamilyVisual = {
	family: "",
	color: [0.7, 0.7, 0.75],
	emissive: [0.15, 0.15, 0.18],
};

/** Longest-prefix match against the family recipes; fallback for unknown ids. */
export function visualFor(archetypeId: string): FamilyVisual {
	let best: FamilyVisual | null = null;
	for (const fv of FAMILY_VISUALS) {
		if (
			archetypeId.startsWith(fv.family) &&
			(best === null || fv.family.length > best.family.length)
		) {
			best = fv;
		}
	}
	return best ?? FALLBACK_VISUAL;
}

/**
 * Powerup pickup visuals — one recipe per kind, kept here (pure, unit-tested)
 * alongside the enemy recipes so the render layer maps kind → color/emissive
 * without a Babylon dependency. Hues are chosen to read as "beneficial pickup"
 * and stay distinct from the enemy families and from each other.
 */
export type PowerupVisualRecipe = {
	color: [number, number, number];
	emissive: [number, number, number];
};

export const POWERUP_VISUALS: Record<PowerupKind, PowerupVisualRecipe> = {
	freeze: { color: [0.45, 0.78, 0.97], emissive: [0.1, 0.4, 0.62] },
	bomb: { color: [0.97, 0.42, 0.22], emissive: [0.55, 0.13, 0.05] },
	heal: { color: [0.42, 0.92, 0.52], emissive: [0.1, 0.48, 0.18] },
	slow: { color: [0.97, 0.82, 0.32], emissive: [0.55, 0.37, 0.07] },
};

export function powerupVisual(kind: PowerupKind): PowerupVisualRecipe {
	return POWERUP_VISUALS[kind];
}

/**
 * Tint a family colour by tier so higher tiers read as hotter/more dangerous
 * without changing hue. Monotonic in tier and clamped to the [0,1] Color3 range.
 * Pure so the render layer can build a per-family+tier material tint from data.
 */
export function tierTint(
	color: [number, number, number],
	tier: 1 | 2 | 3 | 4,
): [number, number, number] {
	const factor = 0.82 + tier * 0.045; // tier1 0.865 → tier4 1.0
	const clamp = (v: number) => Math.min(1, v * factor);
	return [clamp(color[0]), clamp(color[1]), clamp(color[2])];
}
