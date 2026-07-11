import type { Ability, EnemyArchetype } from "../content/enemies";
import type { AbilityState, EnemyState, Vec2 } from "./state";

export function initAbilityState(ability: Ability | null): AbilityState {
	return {
		shieldHits: ability?.kind === "shield" ? ability.hits : 0,
		enraged: false,
	};
}

export function createEnemy(
	arch: EnemyArchetype,
	id: number,
	pos: Vec2,
	spawnTick: number,
	word: string,
): EnemyState {
	return {
		id,
		archetypeId: arch.id,
		pos,
		vel: { x: 0, y: 0 },
		word,
		typedCount: 0,
		hp: arch.hp,
		maxHp: arch.hp,
		alive: true,
		spawnTick,
		speed: arch.speed,
		tier: arch.tier,
		movement: arch.movement,
		ability: arch.ability,
		abilityState: initAbilityState(arch.ability),
	};
}
