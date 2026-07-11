import { pickWord } from "../content/words";
import { cosR, sinR } from "./math";
import { nextFloat, nextInt } from "./rng";
import { ARENA, type GameState, type PowerupKind } from "./state";

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
	// exclude the initials the player could already be aiming at: every live
	// enemy AND every on-field powerup. Two pickups sharing word[0] would make
	// the acquiring keystroke ambiguous between them.
	const initials = new Set<string>();
	for (const e of s.enemies) if (e.alive) initials.add(e.word[0]);
	for (const p of s.powerups) initials.add(p.word[0]);
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

export function applyPowerup(s: GameState, kind: PowerupKind): void {
	// count the activation so the render layer can pulse its ring on the rise of
	// this counter alone — never on a pickup merely expiring while locked
	s.powerupsUsed += 1;
	switch (kind) {
		case "freeze":
			s.freezeTicksLeft = FREEZE_TICKS;
			return;
		case "slow":
			s.slowTicksLeft = SLOW_TICKS;
			return;
		case "heal":
			s.playerHp = Math.min(s.maxPlayerHp, s.playerHp + 1);
			return;
		case "bomb":
			for (const e of s.enemies) {
				if (e.alive) e.alive = false;
			}
			return;
	}
}
