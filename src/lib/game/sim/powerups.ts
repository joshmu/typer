import { pickWord } from "../content/words";
import type { SimEvent } from "./events";
import { cosR, sinR } from "./math";
import { cryoDurationMult } from "./perks";
import { nextFloat, nextInt } from "./rng";
import { ARENA, type GameState, type PowerupKind } from "./state";
import { reservedInitials } from "./wordchain";

export const POWERUP_LIFETIME_TICKS = 600;
export const FREEZE_TICKS = 180;
export const SLOW_TICKS = 300;
export const SLOW_FACTOR = 0.5;
export const POWERUP_SPAWN_EVERY_KILLS = 12;

const KINDS: readonly PowerupKind[] = ["freeze", "bomb", "heal", "slow"];
export const POWERUP_WORDS: readonly string[] = [
	"nova",
	"pulse",
	"surge",
	"blitz",
	"volt",
	"flux",
];

export function spawnPowerup(s: GameState): void {
	const [ki, r1] = nextInt(s.rngState, KINDS.length);
	const [wi, r2] = nextInt(r1, POWERUP_WORDS.length);
	const initials = reservedInitials(s);
	// keep powerup words visually distinct from POWERUP_WORDS pool; fall back to
	// pickWord only if a bank word collides with a reserved initial
	let word = POWERUP_WORDS[wi];
	let r3 = r2;
	if (initials.has(word[0])) {
		const [w, next] = pickWord(r2, initials);
		word = w;
		r3 = next;
	}
	const [angleT, r4] = nextFloat(r3);
	s.rngState = r4;
	const angle = angleT * Math.PI * 2;
	const radius = ARENA.spawnRadius * 0.5;
	s.powerups = [
		...s.powerups,
		{
			id: s.nextPowerupId,
			kind: KINDS[ki],
			word,
			typedCount: 0,
			pos: { x: cosR(angle) * radius, y: sinR(angle) * radius },
			expiresTick: s.tick + POWERUP_LIFETIME_TICKS,
		},
	];
	s.nextPowerupId += 1;
}

export function applyPowerup(
	s: GameState,
	kind: PowerupKind,
	out?: SimEvent[],
): void {
	s.powerupsUsed += 1;
	out?.push({ type: "powerup", kind });
	// cryo-mastery stretches the crowd-control windows at APPLICATION time (floored
	// so tick counts stay integers and the state hash stays cross-engine stable).
	const cryo = cryoDurationMult(s);
	switch (kind) {
		case "freeze":
			s.freezeTicksLeft = Math.floor(FREEZE_TICKS * cryo);
			return;
		case "slow":
			s.slowTicksLeft = Math.floor(SLOW_TICKS * cryo);
			return;
		case "heal":
			s.playerHp = Math.min(s.maxPlayerHp, s.playerHp + 1);
			return;
		case "bomb":
			for (const e of s.enemies) {
				if (!e.alive) continue;
				e.alive = false;
				out?.push({
					type: "kill",
					id: e.id,
					x: e.pos.x,
					y: e.pos.y,
					archetypeId: e.archetypeId,
					cause: "bomb",
				});
			}
			return;
	}
}
