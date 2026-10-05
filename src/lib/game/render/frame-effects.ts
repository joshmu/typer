import { comboMultiplier } from "../sim/combo";
import type { SimEvent } from "../sim/events";

/** light: a keystroke landed; heavy: damage or a kill; clang: an absorb. */
export type ShotKind = "light" | "heavy" | "clang";

/** What the frame's effects can draw. Babylon-free so dispatch is unit testable. */
export type EffectCommands = {
	/** Snap the turret to (x, y) and fire a tracer from its muzzle at enemy `id`. */
	shot(x: number, y: number, kind: ShotKind, id: number): void;
	/** A small spark where non-typed damage clanged off an enemy. */
	spark(x: number, y: number): void;
	/** Death burst and corpse decal: the `nth` of this frame's `of` kills. */
	kill(
		x: number,
		y: number,
		id: number,
		archetypeId: string,
		nth: number,
		of: number,
	): void;
	/** Core-side scar where an enemy broke through. */
	breach(x: number, y: number, id: number): void;
	coreHit(): void;
	powerupPulse(): void;
};

const SHOT_RANK: Record<ShotKind, number> = { light: 0, clang: 1, heavy: 2 };

function typedShot(ev: SimEvent): ShotKind | null {
	switch (ev.type) {
		case "hit":
			return ev.typed ? (ev.damaged ? "heavy" : "light") : null;
		case "absorb":
			return ev.typed ? "clang" : null;
		case "kill":
			return ev.cause === "typed" ? "heavy" : null;
		default:
			return null;
	}
}

// enemy id -> index of the event whose shot is drawn this frame; reused per call
const shotIndex = new Map<number, number>();

/**
 * Map one frame's sim events to effects. Only typed events fire shots, one per
 * enemy per frame: the heaviest, the latest on a tie.
 */
export function dispatchEffects(
	events: readonly SimEvent[],
	fx: EffectCommands,
): void {
	shotIndex.clear();
	let kills = 0;
	for (let i = 0; i < events.length; i++) {
		const ev = events[i];
		if (ev.type === "kill") kills += 1;
		const kind = typedShot(ev);
		if (kind === null || !("id" in ev)) continue;
		const prev = shotIndex.get(ev.id);
		const prevKind = prev === undefined ? null : typedShot(events[prev]);
		if (prevKind === null || SHOT_RANK[kind] >= SHOT_RANK[prevKind]) {
			shotIndex.set(ev.id, i);
		}
	}

	let breached = false;
	let nth = 0;
	for (let i = 0; i < events.length; i++) {
		const ev = events[i];
		const kind = "id" in ev && shotIndex.get(ev.id) === i && typedShot(ev);
		if (kind) fx.shot(ev.x, ev.y, kind, ev.id);
		switch (ev.type) {
			case "absorb":
				if (!ev.typed) fx.spark(ev.x, ev.y);
				break;
			case "kill":
				fx.kill(ev.x, ev.y, ev.id, ev.archetypeId, nth, kills);
				nth += 1;
				break;
			case "breach":
				fx.breach(ev.x, ev.y, ev.id);
				breached = true;
				break;
			case "powerup":
				fx.powerupPulse();
				break;
		}
	}
	if (breached) fx.coreHit();
}

/**
 * Score and multiplier to show on the `nth` of a frame's `of` kills. Each
 * kill carries the multiplier of the streak it reached (`combo` is the streak
 * after the frame). Its points come from `scoreFor(streak)` when the renderer
 * knows the kill's word; otherwise the frame's score gain is split evenly.
 */
export function killCredit(
	of: number,
	scoreGain: number,
	combo: number,
	nth: number,
	scoreFor?: (streak: number) => number,
): { points: number; mult: number } {
	const streak = Math.max(0, combo - (of - 1 - nth));
	const mult = comboMultiplier(streak);
	if (scoreFor) return { points: Math.max(0, scoreFor(streak)), mult };
	const gain = Math.max(0, scoreGain);
	const each = Math.floor(gain / Math.max(1, of));
	const points = nth === of - 1 ? gain - each * (of - 1) : each;
	return { points, mult };
}
