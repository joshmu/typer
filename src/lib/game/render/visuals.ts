/**
 * Pure visual recipes for enemy families. No Babylon imports — this is data plus
 * two tiny helpers so it stays trivially unit-testable. Colors are [r, g, b] in
 * 0..1 (Babylon Color3 space). The render layer maps `shape` to a mesh builder.
 *
 * Families are derived from the roster ids in ../content/enemies.ts: each id is
 * `${family}-${tier}` (e.g. "husk-3"), bosses are `boss-*`. `visualFor` does a
 * longest-prefix match so any future tier lands on its family automatically.
 */
export type EnemyShape =
	| "sphere"
	| "box"
	| "capsule"
	| "torus"
	| "cone"
	| "icosphere";

export type FamilyVisual = {
	family: string;
	color: [number, number, number];
	emissive: [number, number, number];
	shape: EnemyShape;
};

// One recipe per roster family + boss + fallback. Hues are spread so families
// read as distinct at a glance; bosses get an icosphere with high emissive.
export const FAMILY_VISUALS: FamilyVisual[] = [
	{
		family: "husk",
		color: [0.85, 0.25, 0.3],
		emissive: [0.3, 0.05, 0.06],
		shape: "sphere",
	},
	{
		family: "darter",
		color: [0.95, 0.6, 0.15],
		emissive: [0.35, 0.18, 0.03],
		shape: "cone",
	},
	{
		family: "wraith",
		color: [0.6, 0.35, 0.95],
		emissive: [0.2, 0.1, 0.35],
		shape: "capsule",
	},
	{
		family: "charger",
		color: [0.35, 0.85, 0.4],
		emissive: [0.08, 0.3, 0.1],
		shape: "box",
	},
	{
		family: "weaver",
		color: [0.3, 0.8, 0.9],
		emissive: [0.06, 0.28, 0.32],
		shape: "torus",
	},
	{
		family: "brood",
		color: [0.95, 0.35, 0.7],
		emissive: [0.35, 0.08, 0.22],
		shape: "icosphere",
	},
	{
		family: "boss",
		color: [1, 0.85, 0.2],
		emissive: [0.6, 0.45, 0.1],
		shape: "icosphere",
	},
];

export const FALLBACK_VISUAL: FamilyVisual = {
	family: "",
	color: [0.7, 0.7, 0.75],
	emissive: [0.15, 0.15, 0.18],
	shape: "sphere",
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

/** Body scale by tier — monotonic, so higher tiers loom larger. */
export function tierScale(tier: 1 | 2 | 3 | 4): number {
	switch (tier) {
		case 1:
			return 1;
		case 2:
			return 1.15;
		case 3:
			return 1.35;
		case 4:
			return 1.6;
	}
}
