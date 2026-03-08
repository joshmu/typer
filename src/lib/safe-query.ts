import { type Accessor, from } from "solid-js";
import { liveQuery } from "dexie";

/**
 * Safe wrapper around from(liveQuery(...)) that returns a fallback
 * value on error instead of crashing the SolidJS render tree.
 *
 * Dexie's liveQuery can error during DB upgrades, blocked connections,
 * or corrupted state. SolidJS `from()` does not handle observable errors,
 * so an unhandled error would crash rendering.
 */
export function safeFrom<T>(
	querier: () => T | Promise<T>,
	fallback: T,
): Accessor<T> {
	try {
		const observable = liveQuery(querier);
		// SolidJS from() expects: subscribe(fn) => unsubscribe
		// Dexie's observable uses the full Observer pattern with error handling.
		// We bridge the two, catching errors and emitting fallback instead.
		const safeProducer = (setter: (v: T) => void) => {
			const subscription = observable.subscribe({
				next: (value: T) => setter(value),
				error: (err: unknown) => {
					console.error("liveQuery error, using fallback:", err);
					setter(fallback);
				},
			});
			return () => subscription.unsubscribe();
		};
		const accessor = from<T>(safeProducer);
		return () => accessor() ?? fallback;
	} catch (err) {
		console.error("Failed to create liveQuery, using fallback:", err);
		return () => fallback;
	}
}
