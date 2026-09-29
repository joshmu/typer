import type { SimEvent } from "../sim/events";

/** light: a keystroke landed; heavy: damage or a kill; clang: an absorb. */
export type ShotKind = "light" | "heavy" | "clang";

/** What the frame's effects can draw. Babylon-free so dispatch is unit testable. */
export type EffectCommands = {
	/** Snap the turret to (x, y) and fire a tracer from its muzzle. */
	shot(x: number, y: number, kind: ShotKind): void;
	/** A small spark where non-typed damage clanged off an enemy. */
	spark(x: number, y: number): void;
	/** Death burst and corpse decal. */
	kill(x: number, y: number, id: number, archetypeId: string): void;
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
	for (let i = 0; i < events.length; i++) {
		const ev = events[i];
		const kind = typedShot(ev);
		if (kind === null || !("id" in ev)) continue;
		const prev = shotIndex.get(ev.id);
		const prevKind = prev === undefined ? null : typedShot(events[prev]);
		if (prevKind === null || SHOT_RANK[kind] >= SHOT_RANK[prevKind]) {
			shotIndex.set(ev.id, i);
		}
	}

	let breached = false;
	for (let i = 0; i < events.length; i++) {
		const ev = events[i];
		const kind = "id" in ev && shotIndex.get(ev.id) === i && typedShot(ev);
		if (kind) fx.shot(ev.x, ev.y, kind);
		switch (ev.type) {
			case "absorb":
				if (!ev.typed) fx.spark(ev.x, ev.y);
				break;
			case "kill":
				fx.kill(ev.x, ev.y, ev.id, ev.archetypeId);
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
