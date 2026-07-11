export type MovementId =
	| "chase"
	| "zigzag"
	| "orbit-then-dive"
	| "dash-pause"
	| "flank"
	| "spiral";

export type Ability =
	| { kind: "split"; n: number; minion: string }
	| { kind: "shield"; hits: number }
	| { kind: "cloak"; interval: number }
	| { kind: "spawn"; minion: string; rate: number }
	| { kind: "heal-aura"; radius: number; amount: number; interval: number }
	| { kind: "enrage-at-half"; speedMult: number }
	| { kind: "teleport"; interval: number; range: number }
	| { kind: "armored-front"; exposeRadius: number };

export type EnemyArchetype = {
	id: string;
	name: string;
	hp: number;
	speed: number;
	size: number;
	tier: 1 | 2 | 3 | 4;
	movement: MovementId;
	ability: Ability | null;
	role: "regular" | "boss";
};

export const ENEMIES: EnemyArchetype[] = [
	{
		id: "grunt",
		name: "Grunt",
		hp: 1,
		speed: 0.04,
		size: 0.8,
		tier: 1,
		movement: "chase",
		ability: null,
		role: "regular",
	},
	{
		id: "brute",
		name: "Brute",
		hp: 3,
		speed: 0.03,
		size: 1.4,
		tier: 3,
		movement: "chase",
		ability: null,
		role: "regular",
	},
];

const byId = new Map(ENEMIES.map((e) => [e.id, e]));

export function getArchetype(id: string): EnemyArchetype {
	const found = byId.get(id);
	if (!found) throw new Error(`Unknown enemy archetype: ${id}`);
	return found;
}
