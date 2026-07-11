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
	// Husk family — chase
	{
		id: "husk-1",
		name: "Huskling",
		hp: 1,
		speed: 0.035,
		size: 0.7,
		tier: 1,
		movement: "chase",
		ability: null,
		role: "regular",
	},
	{
		id: "husk-2",
		name: "Husk",
		hp: 1,
		speed: 0.031,
		size: 0.9,
		tier: 2,
		movement: "chase",
		ability: null,
		role: "regular",
	},
	{
		id: "husk-3",
		name: "Ravener",
		hp: 2,
		speed: 0.024,
		size: 1.2,
		tier: 3,
		movement: "chase",
		ability: { kind: "enrage-at-half", speedMult: 1.8 },
		role: "regular",
	},
	{
		id: "husk-4",
		name: "Colossus Husk",
		hp: 3,
		speed: 0.017,
		size: 1.7,
		tier: 4,
		movement: "chase",
		ability: { kind: "heal-aura", radius: 5, amount: 1, interval: 180 },
		role: "regular",
	},
	// Darter family — zigzag
	{
		id: "darter-1",
		name: "Nit",
		hp: 1,
		speed: 0.04,
		size: 0.6,
		tier: 1,
		movement: "zigzag",
		ability: null,
		role: "regular",
	},
	{
		id: "darter-2",
		name: "Flitter",
		hp: 1,
		speed: 0.035,
		size: 0.8,
		tier: 2,
		movement: "zigzag",
		ability: { kind: "cloak", interval: 45 },
		role: "regular",
	},
	{
		id: "darter-3",
		name: "Shade Darter",
		hp: 2,
		speed: 0.028,
		size: 1.0,
		tier: 3,
		movement: "zigzag",
		ability: { kind: "cloak", interval: 35 },
		role: "regular",
	},
	{
		id: "darter-4",
		name: "Voidwing",
		hp: 3,
		speed: 0.021,
		size: 1.4,
		tier: 4,
		movement: "zigzag",
		ability: { kind: "teleport", interval: 120, range: 4 },
		role: "regular",
	},
	// Wraith family — orbit-then-dive
	{
		id: "wraith-1",
		name: "Wisp",
		hp: 1,
		speed: 0.036,
		size: 0.6,
		tier: 1,
		movement: "orbit-then-dive",
		ability: null,
		role: "regular",
	},
	{
		id: "wraith-2",
		name: "Haunt",
		hp: 1,
		speed: 0.032,
		size: 0.9,
		tier: 2,
		movement: "orbit-then-dive",
		ability: { kind: "teleport", interval: 150, range: 3 },
		role: "regular",
	},
	{
		id: "wraith-3",
		name: "Phantom",
		hp: 2,
		speed: 0.025,
		size: 1.1,
		tier: 3,
		movement: "orbit-then-dive",
		ability: { kind: "cloak", interval: 40 },
		role: "regular",
	},
	{
		id: "wraith-4",
		name: "Revenant",
		hp: 3,
		speed: 0.02,
		size: 1.5,
		tier: 4,
		movement: "orbit-then-dive",
		ability: { kind: "teleport", interval: 100, range: 5 },
		role: "regular",
	},
	// Charger family — dash-pause
	{
		id: "charger-1",
		name: "Tick",
		hp: 1,
		speed: 0.034,
		size: 0.7,
		tier: 1,
		movement: "dash-pause",
		ability: null,
		role: "regular",
	},
	{
		id: "charger-2",
		name: "Rammer",
		hp: 2,
		speed: 0.029,
		size: 1.0,
		tier: 2,
		movement: "dash-pause",
		ability: { kind: "enrage-at-half", speedMult: 1.6 },
		role: "regular",
	},
	{
		id: "charger-3",
		name: "Gorehoof",
		hp: 2,
		speed: 0.024,
		size: 1.3,
		tier: 3,
		movement: "dash-pause",
		ability: { kind: "enrage-at-half", speedMult: 1.8 },
		role: "regular",
	},
	{
		id: "charger-4",
		name: "Juggernaut",
		hp: 4,
		speed: 0.017,
		size: 1.8,
		tier: 4,
		movement: "dash-pause",
		ability: { kind: "armored-front", exposeRadius: 5 },
		role: "regular",
	},
	// Weaver family — flank
	{
		id: "weaver-1",
		name: "Creeper",
		hp: 1,
		speed: 0.035,
		size: 0.7,
		tier: 1,
		movement: "flank",
		ability: { kind: "shield", hits: 1 },
		role: "regular",
	},
	{
		id: "weaver-2",
		name: "Lancer",
		hp: 2,
		speed: 0.029,
		size: 1.0,
		tier: 2,
		movement: "flank",
		ability: { kind: "shield", hits: 2 },
		role: "regular",
	},
	{
		id: "weaver-3",
		name: "Bulwark",
		hp: 2,
		speed: 0.022,
		size: 1.3,
		tier: 3,
		movement: "flank",
		ability: { kind: "armored-front", exposeRadius: 4 },
		role: "regular",
	},
	{
		id: "weaver-4",
		name: "Aegis",
		hp: 3,
		speed: 0.018,
		size: 1.6,
		tier: 4,
		movement: "flank",
		ability: { kind: "armored-front", exposeRadius: 6 },
		role: "regular",
	},
	// Brood family — spiral
	{
		id: "brood-1",
		name: "Broodling",
		hp: 1,
		speed: 0.039,
		size: 0.5,
		tier: 1,
		movement: "spiral",
		ability: null,
		role: "regular",
	},
	{
		id: "brood-2",
		name: "Spinner",
		hp: 1,
		speed: 0.032,
		size: 0.9,
		tier: 2,
		movement: "spiral",
		ability: { kind: "spawn", minion: "brood-1", rate: 150 },
		role: "regular",
	},
	{
		id: "brood-3",
		name: "Splitter",
		hp: 2,
		speed: 0.025,
		size: 1.1,
		tier: 3,
		movement: "spiral",
		ability: { kind: "split", n: 2, minion: "brood-1" },
		role: "regular",
	},
	{
		id: "brood-4",
		name: "Matron",
		hp: 3,
		speed: 0.018,
		size: 1.5,
		tier: 4,
		movement: "spiral",
		ability: { kind: "spawn", minion: "brood-1", rate: 120 },
		role: "regular",
	},
	// Bosses — role "boss", hp = word-chain length (4-5)
	{
		id: "boss-maw",
		name: "The Maw",
		hp: 5,
		speed: 0.014,
		size: 2.6,
		tier: 4,
		movement: "chase",
		ability: { kind: "heal-aura", radius: 7, amount: 1, interval: 150 },
		role: "boss",
	},
	{
		id: "boss-spire",
		name: "Gloomspire",
		hp: 4,
		speed: 0.015,
		size: 2.4,
		tier: 4,
		movement: "orbit-then-dive",
		ability: { kind: "teleport", interval: 110, range: 6 },
		role: "boss",
	},
	{
		id: "boss-iron",
		name: "Ironclad",
		hp: 5,
		speed: 0.013,
		size: 3.0,
		tier: 4,
		movement: "dash-pause",
		ability: { kind: "armored-front", exposeRadius: 7 },
		role: "boss",
	},
	{
		id: "boss-hive",
		name: "Hivemind",
		hp: 4,
		speed: 0.015,
		size: 2.5,
		tier: 4,
		movement: "spiral",
		ability: { kind: "spawn", minion: "brood-1", rate: 90 },
		role: "boss",
	},
	{
		id: "boss-choir",
		name: "Phantom Choir",
		hp: 4,
		speed: 0.018,
		size: 2.3,
		tier: 4,
		movement: "zigzag",
		ability: { kind: "cloak", interval: 50 },
		role: "boss",
	},
	{
		id: "boss-sunder",
		name: "Sunderer",
		hp: 5,
		speed: 0.014,
		size: 2.8,
		tier: 4,
		movement: "flank",
		ability: { kind: "enrage-at-half", speedMult: 2.0 },
		role: "boss",
	},
];

const byId = new Map(ENEMIES.map((e) => [e.id, e]));

export function getArchetype(id: string): EnemyArchetype {
	const found = byId.get(id);
	if (!found) throw new Error(`Unknown enemy archetype: ${id}`);
	return found;
}
