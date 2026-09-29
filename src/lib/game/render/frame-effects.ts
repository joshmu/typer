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

/** Map one frame's sim events to effects. Only typed events fire shots. */
export function dispatchEffects(
	events: readonly SimEvent[],
	fx: EffectCommands,
): void {
	let breached = false;
	for (const ev of events) {
		switch (ev.type) {
			case "hit":
				if (ev.typed) fx.shot(ev.x, ev.y, ev.damaged ? "heavy" : "light");
				break;
			case "absorb":
				if (ev.typed) fx.shot(ev.x, ev.y, "clang");
				else fx.spark(ev.x, ev.y);
				break;
			case "kill":
				if (ev.cause === "typed") fx.shot(ev.x, ev.y, "heavy");
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
