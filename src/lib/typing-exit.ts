import { prefersReducedMotion } from "@/lib/utils/reduced-motion";

const EXIT_MS = 180;

/**
 * Fade and lift the finished typing block before the results replace it.
 * Null when there is nothing to animate, so the caller can swap at once.
 */
export function exitTypingBlock(): Promise<void> | null {
	if (typeof document === "undefined") return null;
	const test = document.querySelector<HTMLElement>(
		'[data-testid="typing-test"]',
	);
	const block = test?.parentElement ?? test;
	if (!block || typeof block.animate !== "function") return null;
	if (prefersReducedMotion()) return null;
	return block
		.animate(
			[
				{ opacity: 1, transform: "translateY(0)" },
				{ opacity: 0, transform: "translateY(-8px)" },
			],
			{
				duration: EXIT_MS,
				easing: "cubic-bezier(0.4, 0, 1, 1)",
				fill: "forwards",
			},
		)
		.finished.then(
			() => undefined,
			() => undefined,
		);
}
