export type EnemyArchetype = {
	id: string;
	name: string;
	hp: number;
	speed: number;
	size: number;
	tier: 1 | 2 | 3 | 4;
};

export const ENEMIES: EnemyArchetype[] = [
	{ id: "grunt", name: "Grunt", hp: 1, speed: 0.04, size: 0.8, tier: 1 },
];

const byId = new Map(ENEMIES.map((e) => [e.id, e]));

export function getArchetype(id: string): EnemyArchetype {
	const found = byId.get(id);
	if (!found) throw new Error(`Unknown enemy archetype: ${id}`);
	return found;
}
