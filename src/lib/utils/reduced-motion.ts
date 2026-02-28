import { createSignal, onCleanup } from "solid-js";

export function prefersReducedMotion(): boolean {
	if (typeof window === "undefined") return false;
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useReducedMotion() {
	if (typeof window === "undefined") {
		return () => false;
	}

	const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
	const [reduced, setReduced] = createSignal(mql.matches);

	const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
	mql.addEventListener("change", handler);
	onCleanup(() => mql.removeEventListener("change", handler));

	return reduced;
}
