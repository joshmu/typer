import { isCharMatch } from "@/lib/core/text/char-match";
import { isCloaked, isTargetable, tickAbility } from "./abilities";
import { resolveCompletion } from "./combat";
import { dist } from "./math";
import { MOVEMENTS } from "./movement";
import {
	GRAVITY_WELL_FACTOR,
	GRAVITY_WELL_RADIUS,
	hasPerk,
	type PerkId,
	powerupMilestoneDivisor,
	VAMPIRIC_EVERY,
} from "./perks";
import { separate, steer } from "./physics";
import { applyPowerup, SLOW_FACTOR, spawnPowerup } from "./powerups";
import { INTERMISSION_TICKS, runWaveDirector } from "./spawner";
import { ARENA, currentWord, type EnemyState, type GameState } from "./state";

export type GameEvent =
	| { type: "key"; key: string }
	// Backspace releases the current lock (keeping all typed progress). Never a
	// miss — it is a deliberate "let go of this target" input, ZType/Typing-of-
	// the-Dead style, so the player can free-flow to another enemy.
	| { type: "backspace" }
	// Perk pick during "perk-choice": applies perkOffer[index] (0|1|2). Out-of-
	// range indices and events fired outside perk-choice are ignored.
	| { type: "perk"; index: number };

/**
 * Apply the chosen perk: own it, clear the offer, and leave perk-choice for a
 * normal intermission (resetting the wave's free-miss charge). Instant stat
 * perks (plating) and milestone-anchored perks (vampiric) settle here so they
 * never retroactively fire. No-ops on a bad index or a missing offer.
 */
/** Boolean read of the perk-choice phase — used after runWaveDirector so TS does
 * not carry stale control-flow narrowing of `wavePhase` past the director call. */
function enteredPerkChoice(s: GameState): boolean {
	return s.wavePhase === "perk-choice";
}

function applyPerkChoice(s: GameState, index: number): void {
	const offer = s.perkOffer;
	if (offer === null || index < 0 || index >= offer.length) return;
	const perk: PerkId = offer[index];
	s.perks = [...s.perks, perk];
	s.perkOffer = null;
	s.wavePhase = "intermission";
	s.intermissionTicksLeft = INTERMISSION_TICKS;
	s.steadyHandsUsedThisWave = false;
	if (perk === "plating") {
		s.maxPlayerHp += 1;
		s.playerHp += 1;
	} else if (perk === "vampiric") {
		// anchor the heal milestone at the current kill count so picking vampiric
		// mid-run never dumps a burst of retroactive heals for kills already banked
		s.lastVampiricMilestone = Math.floor(s.kills / VAMPIRIC_EVERY);
	}
}

export function step(
	state: GameState,
	events: readonly GameEvent[],
): GameState {
	if (state.status === "gameover") return state;

	const s: GameState = {
		...state,
		tick: state.tick + 1,
		enemies: state.enemies.map((e) => ({
			...e,
			pos: { ...e.pos },
			vel: { ...e.vel },
			abilityState: { ...e.abilityState },
		})),
		powerups: state.powerups.map((p) => ({ ...p, pos: { ...p.pos } })),
	};

	// FROZEN perk-choice: the field is empty and every system is paused (no
	// spawning, movement, ability/combo/effect/powerup ticks, no key routing or
	// misses). The ONLY input that acts is a perk event, which advances the phase.
	// An early return keeps this a single readable branch rather than scattering
	// `wavePhase !== "perk-choice"` guards through the whole tick body.
	if (s.wavePhase === "perk-choice") {
		for (const ev of events) {
			if (ev.type === "perk") applyPerkChoice(s, ev.index);
		}
		return s;
	}

	// wave director: intermissions + escalating spawns
	runWaveDirector(s);

	// the last enemy may have just died → the director entered perk-choice and drew
	// the offer THIS tick. Freeze the remainder of the tick too (no movement, no
	// typing, no misses); the player's perk event resolves it on a later tick.
	// (Read through a helper so TS re-widens `wavePhase` after the director mutated
	// it — the direct early return above otherwise narrows it out of the union.)
	if (enteredPerkChoice(s)) return s;

	// abilities (spawn / heal / teleport / enrage) — O(enemies)
	for (const e of s.enemies) {
		if (e.alive && e.ability) tickAbility(s, e);
	}

	// movement physics + player collision
	let moveScale = 1;
	if (s.freezeTicksLeft > 0) moveScale = 0;
	else if (s.slowTicksLeft > 0) moveScale = SLOW_FACTOR;
	const alive = s.enemies.filter((e) => e.alive);
	// moveScale gates EVERY velocity mutation this tick — steer, separation,
	// knockback and integration alike — so a freeze (0) leaves velocity perfectly
	// inert (nothing accumulates, nothing scatters on unfreeze) and slow (0.5)
	// scales it all in lockstep, rather than only throttling the final integration.
	// 1) each behaviour emits a DESIRED velocity; steer bends actual velocity
	// toward it within an accel budget, so enemies carry inertia (no teleporting).
	// gravity-well shrinks the DESIRED velocity (not e.speed) for enemies inside
	// its radius — a per-enemy slow layered on top of the global freeze/slow scale.
	const gravityWell = hasPerk(s, "gravity-well");
	for (const e of alive) {
		const desired = MOVEMENTS[e.movement](e, s.tick);
		if (gravityWell && dist(e.pos.x, e.pos.y) <= GRAVITY_WELL_RADIUS) {
			desired.x *= GRAVITY_WELL_FACTOR;
			desired.y *= GRAVITY_WELL_FACTOR;
		}
		steer(e, desired, moveScale);
	}
	// 2) crowd separation shoves overlapping bodies apart (adds to velocity)
	separate(alive, moveScale);
	// 3) integrate the (already gated) velocity into position and resolve
	// core collisions
	for (const e of alive) {
		e.pos.x += e.vel.x * moveScale;
		e.pos.y += e.vel.y * moveScale;
		if (dist(e.pos.x, e.pos.y) <= ARENA.killRadius) {
			e.alive = false;
			s.playerHp -= 1;
			if (s.targetId === e.id) s.targetId = null;
			if (s.playerHp <= 0) {
				s.playerHp = 0;
				s.status = "gameover";
			}
		}
	}
	if (s.status === "gameover") {
		s.enemies = s.enemies.filter((e) => e.alive);
		return s;
	}

	// combo decay
	if (s.comboTicksLeft > 0) {
		s.comboTicksLeft -= 1;
		if (s.comboTicksLeft === 0) s.combo = 0;
	}

	// effect timers
	if (s.freezeTicksLeft > 0) s.freezeTicksLeft -= 1;
	if (s.slowTicksLeft > 0) s.slowTicksLeft -= 1;

	// powerup lifetime + kill-milestone spawn
	if (s.powerups.length > 0) {
		s.powerups = s.powerups.filter((p) => p.expiresTick > s.tick);
		if (
			s.targetPowerupId !== null &&
			!s.powerups.some((p) => p.id === s.targetPowerupId)
		) {
			s.targetPowerupId = null;
		}
	}
	// kill-milestone powerup: track the highest kills/divisor milestone reached, so
	// a double-kill tick that jumps past a multiple (e.g. 11 → 13) still spawns.
	// scavenger tightens the divisor 12 → 9.
	const milestone = Math.floor(s.kills / powerupMilestoneDivisor(s));
	if (milestone > s.lastPowerupMilestone) {
		s.lastPowerupMilestone = milestone;
		spawnPowerup(s);
	}

	// vampiric: heal 1 hp (capped) at each 15-kill milestone, tracked like the
	// powerup milestone so a multi-kill tick can't skip past a threshold. The
	// milestone was anchored at acquisition so it never heals retroactively.
	if (hasPerk(s, "vampiric")) {
		const vamp = Math.floor(s.kills / VAMPIRIC_EVERY);
		if (vamp > s.lastVampiricMilestone) {
			s.lastVampiricMilestone = vamp;
			s.playerHp = Math.min(s.maxPlayerHp, s.playerHp + 1);
		}
	}

	// every successful keystroke is a "hit": it feeds both the lifetime hit tally
	// and the overclock streak (consecutive hits since the last miss), so the two
	// stay in lockstep across all four routing paths below.
	const registerHit = () => {
		s.hits += 1;
		s.overclockStreak += 1;
	};

	// typing — ZType-style free-flow routing. A keystroke first tries to CONTINUE
	// the active lock; failing that it re-routes to the nearest other target whose
	// next-needed char matches (partial progress on every enemy is preserved, never
	// reset); only a key that matches nothing live is a miss. At most one lock is
	// held at a time (enemy XOR powerup).
	for (const ev of events) {
		// perk events act only in perk-choice (handled by the early return above);
		// here they are inert — never a hit, never a miss.
		if (ev.type === "perk") continue;
		if (ev.type === "backspace") {
			// release the active lock; all typed progress on every target is kept
			s.targetId = null;
			s.targetPowerupId = null;
			continue;
		}

		// 1) continue the active lock (powerup takes precedence, mirroring the old
		// acquisition order). A mismatch does NOT miss here — it falls through to
		// re-routing, which is the whole point of free-flow.
		if (s.targetPowerupId !== null) {
			const pu = s.powerups.find((p) => p.id === s.targetPowerupId);
			if (pu && isCharMatch(ev.key, pu.word[pu.typedCount])) {
				pu.typedCount += 1;
				registerHit();
				if (pu.typedCount >= pu.word.length) {
					applyPowerup(s, pu.kind);
					s.powerups = s.powerups.filter((p) => p.id !== pu.id);
					s.targetPowerupId = null;
				}
				continue;
			}
			if (!pu) s.targetPowerupId = null; // stale lock
		} else if (s.targetId !== null) {
			const target = s.enemies.find((e) => e.id === s.targetId && e.alive);
			if (target) {
				if (isCharMatch(ev.key, currentWord(target)[target.typedCount])) {
					target.typedCount += 1;
					registerHit();
					resolveCompletion(s, target, moveScale);
					continue;
				}
				// alive but this key doesn't continue it → fall through to re-route
			} else {
				s.targetId = null; // stale lock
			}
		}

		// 2) re-route: nearest alive, targetable enemy whose NEXT-needed char
		// matches. Covers fresh enemies (typedCount 0 → initial) AND previously
		// partial ones (at their saved progress) in one scan. Nearest to the core
		// wins the tie-break. Switching keeps the previous target's typedCount.
		let picked: EnemyState | undefined;
		let bestDist = Number.POSITIVE_INFINITY;
		for (const e of s.enemies) {
			if (!e.alive || !isTargetable(e, s.tick)) continue;
			if (!isCharMatch(ev.key, currentWord(e)[e.typedCount])) continue;
			const d = dist(e.pos.x, e.pos.y);
			if (d < bestDist) {
				bestDist = d;
				picked = e;
			}
		}
		if (picked) {
			s.targetId = picked.id;
			s.targetPowerupId = null;
			picked.typedCount += 1;
			registerHit();
			resolveCompletion(s, picked, moveScale);
			continue;
		}

		// 3) powerups: resume/acquire by next-needed char (few ever on field)
		const pu = s.powerups.find((p) =>
			isCharMatch(ev.key, p.word[p.typedCount]),
		);
		if (pu) {
			s.targetPowerupId = pu.id;
			s.targetId = null;
			pu.typedCount += 1;
			registerHit();
			if (pu.typedCount >= pu.word.length) {
				applyPowerup(s, pu.kind);
				s.powerups = s.powerups.filter((p) => p.id !== pu.id);
				s.targetPowerupId = null;
			}
			continue;
		}

		// 4) the key matches a cloaked (hidden-phase) enemy's NEXT-needed char (its
		// saved typedCount, not just the word initial): it is
		// unfair to penalise a target the player cannot yet see, so ignore it —
		// no miss, no combo break — rather than count it against them
		if (
			s.enemies.some(
				(e) =>
					e.alive &&
					isCloaked(e, s.tick) &&
					isCharMatch(ev.key, currentWord(e)[e.typedCount]),
			)
		) {
			continue;
		}

		// 5) dead key → miss. A miss always resets the overclock streak. steady-hands
		// spares the combo on the FIRST miss each wave (spending its charge); every
		// other miss breaks the combo as usual.
		s.misses += 1;
		s.overclockStreak = 0;
		if (hasPerk(s, "steady-hands") && !s.steadyHandsUsedThisWave) {
			s.steadyHandsUsedThisWave = true;
		} else {
			s.combo = 0;
			s.comboTicksLeft = 0;
		}
	}

	// prune enemies killed this tick so state size tracks live enemies only
	s.enemies = s.enemies.filter((e) => e.alive);
	return s;
}
