import type confettiFn from "canvas-confetti";
import { prefersReducedMotion } from "@/lib/utils/reduced-motion";

const HEX = /^#(?:[0-9a-f]{3}){1,2}$/i;

let loaded: typeof confettiFn | null = null;

function themeColour(name: string): string | null {
	const value = getComputedStyle(document.documentElement)
		.getPropertyValue(name)
		.trim();
	return HEX.test(value) ? value : null;
}

/** One burst of theme-coloured confetti from an element, for a new best. */
export async function burstFrom(el: HTMLElement): Promise<void> {
	if (prefersReducedMotion()) return;
	loaded ??= (await import("canvas-confetti")).default;
	// The results screen may have closed while confetti loaded.
	if (!el.isConnected) return;
	const rect = el.getBoundingClientRect();
	const primary = themeColour("--primary") ?? "#e2b714";
	await loaded({
		particleCount: 70,
		spread: 75,
		startVelocity: 30,
		gravity: 0.9,
		decay: 0.91,
		ticks: 110,
		scalar: 0.75,
		origin: {
			x: (rect.left + rect.width / 2) / window.innerWidth,
			y: (rect.top + rect.height / 2) / window.innerHeight,
		},
		colors: [
			primary,
			primary,
			themeColour("--caret") ?? primary,
			themeColour("--text") ?? primary,
		],
		disableForReducedMotion: true,
	});
}

/** Clear any burst still falling, so it never runs into the next test. */
export function stopBurst(): void {
	loaded?.reset();
}
