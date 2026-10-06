import { describe, expect, it } from "vitest";
import { createWarmup, type WarmStep } from "./warmup";

/** A manual task queue standing in for setTimeout. */
function fakeTimers() {
	let queue: { id: number; fn: () => void; ms: number }[] = [];
	let id = 0;
	return {
		schedule(fn: () => void, ms: number) {
			queue.push({ id: ++id, fn, ms });
			return id as unknown as ReturnType<typeof setTimeout>;
		},
		cancel(t: ReturnType<typeof setTimeout>) {
			queue = queue.filter((q) => q.id !== (t as unknown as number));
		},
		pending: () => queue.length,
		delays: () => queue.map((q) => q.ms),
		/** Run the next queued task; false when none is left. */
		tick(): boolean {
			const q = queue.shift();
			q?.fn();
			return q !== undefined;
		},
	};
}

describe("createWarmup", () => {
	it("waits for start, then runs one step per task", () => {
		const timers = fakeTimers();
		const ran: number[] = [];
		const steps: WarmStep[] = [0, 1, 2].map((i) => () => {
			ran.push(i);
			return true;
		});
		const w = createWarmup(steps, timers);
		expect(timers.pending()).toBe(0);
		expect(w.done()).toBe(false);

		w.start();
		w.start();
		expect(timers.pending()).toBe(1);
		timers.tick();
		expect(ran).toEqual([0]);
		expect(w.done()).toBe(false);
		timers.tick();
		timers.tick();
		expect(ran).toEqual([0, 1, 2]);
		expect(w.done()).toBe(true);
		expect(timers.pending()).toBe(0);
	});

	it("retries a step still compiling after a delay", () => {
		const timers = fakeTimers();
		let calls = 0;
		const w = createWarmup([() => ++calls >= 3], { ...timers, retryMs: 16 });
		w.start();
		timers.tick();
		expect(timers.delays()).toEqual([16]);
		timers.tick();
		expect(w.done()).toBe(false);
		timers.tick();
		expect(calls).toBe(3);
		expect(w.done()).toBe(true);
	});

	it("gives up on a step that never finishes, so done always arrives", () => {
		const timers = fakeTimers();
		const w = createWarmup([() => false], { ...timers, maxTries: 4 });
		w.start();
		let tasks = 0;
		while (timers.tick()) tasks++;
		expect(tasks).toBe(4);
		expect(w.done()).toBe(true);
	});

	it("treats a throwing step as done", () => {
		const timers = fakeTimers();
		const w = createWarmup(
			[
				() => {
					throw new Error("context lost");
				},
			],
			timers,
		);
		w.start();
		timers.tick();
		expect(w.done()).toBe(true);
	});

	it("runs nothing after dispose", () => {
		const timers = fakeTimers();
		let calls = 0;
		const w = createWarmup(
			[
				() => {
					calls++;
					return true;
				},
				() => {
					calls++;
					return true;
				},
			],
			timers,
		);
		w.start();
		timers.tick();
		w.dispose();
		expect(timers.pending()).toBe(0);
		w.start();
		expect(timers.pending()).toBe(0);
		expect(calls).toBe(1);
	});

	it("is done at once with no steps", () => {
		const w = createWarmup([], fakeTimers());
		w.start();
		expect(w.done()).toBe(true);
	});
});
