import { nextFloat } from "./rng";
import { COMBO_DECAY_TICKS, killScore } from "./score";
import type { GameState } from "./state";

/**
 * Roguelite perk draft (round 7). Between every wave the sim offers three
 * rarity-weighted perks; the player keeps the ones they pick for the run (no
 * meta-progression). Everything here is PURE and deterministic — draws thread
 * `s.rngState`, effects read `s.perks`, and no banned Math is used — so the perk
 * layer stays inside the replay/determinism contract like the rest of the sim.
 *
 * Data (ids/rarities/descriptions + PERK_DEFS) is content-adjacent but lives in
 * `sim/` because the determinism scan covers it and effects are sim-owned.
 */
export type PerkId =
	// epic — weapons (change what a kill does)
	| "splash-rounds"
	| "piercing-bolt"
	| "chain-arc"
	| "heavy-rounds"
	// rare — typing / utility
	| "steady-hands"
	| "sharpshooter"
	| "overclock"
	| "gravity-well"
	| "vampiric"
	// common — stats
	| "plating"
	| "cryo-mastery"
	| "adrenaline"
	| "scavenger"
	| "greed";

export type Rarity = "common" | "rare" | "epic";

export type PerkDef = {
	id: PerkId;
	name: string;
	desc: string;
	rarity: Rarity;
	/** Repeatable perks stay eligible forever and may be offered/owned twice. */
	repeatable: boolean;
};

export const PERK_DEFS: Record<PerkId, PerkDef> = {
	"splash-rounds": {
		id: "splash-rounds",
		name: "Splash Rounds",
		desc: "Kills detonate: 1 damage to enemies within 6 units.",
		rarity: "epic",
		repeatable: false,
	},
	"piercing-bolt": {
		id: "piercing-bolt",
		name: "Piercing Bolt",
		desc: "Kill bolt pierces the nearest enemy behind the victim.",
		rarity: "epic",
		repeatable: false,
	},
	"chain-arc": {
		id: "chain-arc",
		name: "Chain Arc",
		desc: "At combo 10+, a kill arcs 1 damage to a nearby enemy.",
		rarity: "epic",
		repeatable: false,
	},
	"heavy-rounds": {
		id: "heavy-rounds",
		name: "Heavy Rounds",
		desc: "Double knockback; bosses recoil harder too.",
		rarity: "epic",
		repeatable: false,
	},
	"steady-hands": {
		id: "steady-hands",
		name: "Steady Hands",
		desc: "First miss each wave never breaks your combo.",
		rarity: "rare",
		repeatable: false,
	},
	sharpshooter: {
		id: "sharpshooter",
		name: "Sharpshooter",
		desc: "Kill score x1.5.",
		rarity: "rare",
		repeatable: false,
	},
	overclock: {
		id: "overclock",
		name: "Overclock",
		desc: "20 hits without a miss primes +1 damage on your next kill.",
		rarity: "rare",
		repeatable: false,
	},
	"gravity-well": {
		id: "gravity-well",
		name: "Gravity Well",
		desc: "Enemies within 8 units of the core move at 75% speed.",
		rarity: "rare",
		repeatable: false,
	},
	vampiric: {
		id: "vampiric",
		name: "Vampiric",
		desc: "Every 15 kills heals 1 hp.",
		rarity: "rare",
		repeatable: false,
	},
	plating: {
		id: "plating",
		name: "Plating",
		desc: "+1 max hp and heal 1.",
		rarity: "common",
		repeatable: true,
	},
	"cryo-mastery": {
		id: "cryo-mastery",
		name: "Cryo Mastery",
		desc: "Freeze and slow powerups last 50% longer.",
		rarity: "common",
		repeatable: false,
	},
	adrenaline: {
		id: "adrenaline",
		name: "Adrenaline",
		desc: "Combo decay window is 50% longer.",
		rarity: "common",
		repeatable: false,
	},
	scavenger: {
		id: "scavenger",
		name: "Scavenger",
		desc: "Powerups drop every 9 kills instead of 12.",
		rarity: "common",
		repeatable: false,
	},
	greed: {
		id: "greed",
		name: "Greed",
		desc: "+10% score (stacks).",
		rarity: "common",
		repeatable: true,
	},
};

export const ALL_PERK_IDS = Object.keys(PERK_DEFS) as PerkId[];

export const RARITY_WEIGHT: Record<Rarity, number> = {
	common: 6,
	rare: 3,
	epic: 1,
};

// filler perks used to pad a draw that cannot otherwise field 3 distinct ids —
// both are repeatable so they are always eligible.
const FILLERS: PerkId[] = ["plating", "greed"];

// --- effect tuning constants (single source, imported where each effect acts) --
export const OVERCLOCK_STREAK = 20;
export const VAMPIRIC_EVERY = 15;
export const GRAVITY_WELL_RADIUS = 8;
export const GRAVITY_WELL_FACTOR = 0.75;
export const SPLASH_RADIUS = 6;
export const PIERCE_RANGE = 12;
export const PIERCE_DOT = 0.5;
export const CHAIN_RANGE = 10;
export const CHAIN_COMBO = 10;
const SHARPSHOOTER_MULT = 1.5;
const GREED_PER_STACK = 0.1;
const CRYO_MULT = 1.5;
const ADRENALINE_MULT = 1.5;
// base 12 mirrors POWERUP_SPAWN_EVERY_KILLS; inlined to keep perks.ts free of a
// powerups.ts import (powerups imports cryoDurationMult from here).
const POWERUP_DIVISOR_BASE = 12;
const SCAVENGER_DIVISOR = 9;

export function hasPerk(s: GameState, id: PerkId): boolean {
	return s.perks.includes(id);
}

export function perkCount(s: GameState, id: PerkId): number {
	let n = 0;
	for (const p of s.perks) if (p === id) n += 1;
	return n;
}

/**
 * Draw three distinct, rarity-weighted perk ids into `s.perkOffer`, threading
 * `s.rngState`. Owned non-repeatable perks are excluded; `plating`/`greed` stay
 * eligible forever. Weighted WITHOUT replacement (each pick removed from the
 * pool) so the three cards are always distinct. If fewer than 3 ids are eligible
 * the offer is padded with plating/greed (degenerate late-run case only).
 */
export function drawPerkOffer(s: GameState): void {
	let pool = ALL_PERK_IDS.filter((id) => {
		const def = PERK_DEFS[id];
		return def.repeatable || !s.perks.includes(id);
	});
	const offer: PerkId[] = [];
	let state = s.rngState;
	while (offer.length < 3 && pool.length > 0) {
		let total = 0;
		for (const id of pool) total += RARITY_WEIGHT[PERK_DEFS[id].rarity];
		const [f, next] = nextFloat(state);
		state = next;
		let roll = f * total;
		let picked = pool.length - 1;
		for (let i = 0; i < pool.length; i++) {
			roll -= RARITY_WEIGHT[PERK_DEFS[pool[i]].rarity];
			if (roll < 0) {
				picked = i;
				break;
			}
		}
		offer.push(pool[picked]);
		pool = pool.filter((_, i) => i !== picked);
	}
	// pad a starved pool (only possible once nearly every perk is owned)
	let fi = 0;
	while (offer.length < 3) {
		offer.push(FILLERS[fi % FILLERS.length]);
		fi += 1;
	}
	s.rngState = state;
	s.perkOffer = offer;
}

/** Apply greed (`+10%` per stack, floored) to any score gain. Identity at 0. */
export function scoreWithPerks(s: GameState, base: number): number {
	const stacks = perkCount(s, "greed");
	if (stacks === 0) return base;
	return Math.floor(base * (1 + GREED_PER_STACK * stacks));
}

/** Kill score with sharpshooter (x1.5) then greed applied, each floored. */
export function killScoreWithPerks(
	s: GameState,
	wordLength: number,
	combo: number,
): number {
	let ks = killScore(wordLength, combo);
	if (hasPerk(s, "sharpshooter")) ks = Math.floor(ks * SHARPSHOOTER_MULT);
	return scoreWithPerks(s, ks);
}

/** Knockback multiplier: heavy-rounds doubles regulars, lifts bosses 0.4→0.6. */
export function knockbackMult(s: GameState, isBoss: boolean): number {
	const heavy = hasPerk(s, "heavy-rounds");
	if (isBoss) return heavy ? 0.6 : 0.4;
	return heavy ? 2 : 1;
}

/** Freeze/slow powerup duration multiplier (cryo-mastery x1.5). */
export function cryoDurationMult(s: GameState): number {
	return hasPerk(s, "cryo-mastery") ? CRYO_MULT : 1;
}

/** Combo decay window in ticks (adrenaline widens it x1.5, floored). */
export function comboDecayTicks(s: GameState): number {
	return hasPerk(s, "adrenaline")
		? Math.floor(COMBO_DECAY_TICKS * ADRENALINE_MULT)
		: COMBO_DECAY_TICKS;
}

/** Kills between powerup drops (scavenger tightens 12→9). */
export function powerupMilestoneDivisor(s: GameState): number {
	return hasPerk(s, "scavenger") ? SCAVENGER_DIVISOR : POWERUP_DIVISOR_BASE;
}

/** True when overclock is owned and its consecutive-hit streak is charged. */
export function isOverclockPrimed(s: GameState): boolean {
	return hasPerk(s, "overclock") && s.overclockStreak >= OVERCLOCK_STREAK;
}
