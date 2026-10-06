/**
 * Plays a one-shot CSS animation by adding `cls` and removing it when the
 * named animation ends or is cancelled. A pulse already running is left to
 * finish. Pure class toggling on one node, so it is safe on the keystroke path.
 */
export function pulseClass(
	el: Element | undefined,
	cls: string,
	animationName: string,
): void {
	if (!el || el.classList.contains(cls)) return;
	el.classList.add(cls);
	const done = (e: Event) => {
		if ((e as AnimationEvent).animationName !== animationName) return;
		el.classList.remove(cls);
		el.removeEventListener("animationend", done);
		el.removeEventListener("animationcancel", done);
	};
	el.addEventListener("animationend", done);
	el.addEventListener("animationcancel", done);
}
