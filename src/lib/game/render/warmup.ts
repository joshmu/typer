/** One piece of first-use work. Returns true once it is done (e.g. its shader
 * is built); false asks to be tried again later. */
export type WarmStep = () => boolean;

export type Warmup = {
	/** Begin, one step per task. Calling it again does nothing. */
	start(): void;
	/** Every step has finished (or given up). */
	done(): boolean;
	dispose(): void;
};

type Timer = ReturnType<typeof setTimeout>;

export type WarmupOptions = {
	schedule?: (fn: () => void, ms: number) => Timer;
	cancel?: (timer: Timer) => void;
	/** Wait between tries of a step that isn't done yet (an async compile). */
	retryMs?: number;
	/** Tries per step before it is given up on, so `done` always arrives. */
	maxTries?: number;
};

/**
 * Runs first-use work (shader variants the first shot would otherwise compile
 * mid-keystroke) before play needs it. Each step gets its own task, so the
 * page stays responsive between them, and a step still compiling in the
 * background is retried rather than waited on.
 */
export function createWarmup(
	steps: readonly WarmStep[],
	{
		schedule = (fn, ms) => setTimeout(fn, ms),
		cancel = (t) => clearTimeout(t),
		retryMs = 16,
		maxTries = 120,
	}: WarmupOptions = {},
): Warmup {
	let next = 0;
	let tries = 0;
	let timer: Timer | undefined;
	let started = false;
	let disposed = false;

	function run(): void {
		timer = undefined;
		if (disposed) return;
		let ok: boolean;
		try {
			ok = steps[next]();
		} catch {
			// a failed warm-up only costs the hitch it meant to save
			ok = true;
		}
		tries += 1;
		if (ok || tries >= maxTries) {
			next += 1;
			tries = 0;
		}
		if (next < steps.length) timer = schedule(run, ok ? 0 : retryMs);
	}

	return {
		start() {
			if (started || disposed) return;
			started = true;
			if (steps.length > 0) timer = schedule(run, 0);
		},
		done: () => next >= steps.length,
		dispose() {
			disposed = true;
			if (timer !== undefined) cancel(timer);
			timer = undefined;
		},
	};
}
