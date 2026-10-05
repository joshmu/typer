import { describe, expect, it } from "vitest";
import { createQualityWatch, isSlowRenderer } from "./quality";

/** Feed `ms` of frames of `dt` each, collecting every step taken. */
function run(
	watch: ReturnType<typeof createQualityWatch>,
	from: number,
	ms: number,
	dt: (i: number) => number,
): { steps: string[]; end: number } {
	const steps: string[] = [];
	let t = from;
	for (let i = 0; t < from + ms; i++) {
		const d = dt(i);
		t += d;
		const step = watch.sample(d, t);
		if (step) steps.push(step);
	}
	return { steps, end: t };
}

describe("createQualityWatch", () => {
	it("never steps down at 60fps or 120fps", () => {
		expect(run(createQualityWatch(), 0, 10000, () => 1000 / 60).steps).toEqual(
			[],
		);
		expect(run(createQualityWatch(), 0, 10000, () => 1000 / 120).steps).toEqual(
			[],
		);
	});

	it("ignores rare spikes that stay under the p90", () => {
		const r = run(createQualityWatch(), 0, 10000, (i) =>
			i % 20 === 0 ? 80 : 16.7,
		);
		expect(r.steps).toEqual([]);
	});

	it("sheds post after 2s of slow frames, then lowers resolution, then stops", () => {
		const w = createQualityWatch();
		const first = run(w, 0, 1900, () => 25);
		expect(first.steps).toEqual([]);
		const second = run(w, first.end, 300, () => 25);
		expect(second.steps).toEqual(["shed-post"]);
		const third = run(w, second.end, 2200, () => 25);
		expect(third.steps).toEqual(["lower-resolution"]);
		expect(run(w, third.end, 10000, () => 40).steps).toEqual([]);
	});

	it("is one-way: recovering never steps back up", () => {
		const w = createQualityWatch();
		const slow = run(w, 0, 2200, () => 25);
		expect(slow.steps).toEqual(["shed-post"]);
		expect(run(w, slow.end, 5000, () => 8).steps).toEqual([]);
		expect(w.level()).toBe(1);
	});

	it("skips gaps from a hidden tab or a pause", () => {
		const w = createQualityWatch();
		expect(run(w, 0, 3000, (i) => (i % 2 ? 16.7 : 900)).steps).toEqual([]);
	});
});

describe("isSlowRenderer", () => {
	it("names software and fallback rasterisers", () => {
		for (const r of [
			"ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)",
			"llvmpipe (LLVM 15.0.7, 256 bits)",
			"ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0)",
		]) {
			expect(isSlowRenderer(r)).toBe(true);
		}
		expect(
			isSlowRenderer("ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max)"),
		).toBe(false);
	});
});
