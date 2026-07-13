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
	words: string[],
): EnemyState {
	return {
		id,
		archetypeId: arch.id,
		pos,
		vel: { x: 0, y: 0 },
		words,
		wordIndex: 0,
		typedCount: 0,
		// hp derives from the chain length, NOT arch.hp — one word = one damage, so
		// `words.length === hp === maxHp` holds universally. Regulars are unchanged
		// (their chain is already arch.hp long); bosses field a whole sentence whose
		// length overrides the archetype's nominal hp.
		hp: words.length,
		maxHp: words.length,
		alive: true,
		spawnTick,
		speed: arch.speed,
		tier: arch.tier,
		movement: arch.movement,
		ability: arch.ability,
		abilityState: initAbilityState(arch.ability),
		movePhase: 0,
		phaseTick: 0,
	};
}
