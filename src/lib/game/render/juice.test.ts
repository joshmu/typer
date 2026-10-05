import { describe, expect, it } from "vitest";
import { createJuice, type JuiceOutput } from "./juice";

/** Sample a juice from `from` to `to` ms at a display refresh of `hz`. */
function sample(
	juice: ReturnType<typeof createJuice>,
	combo: number,
	from: number,
	to: number,
	hz: number,
): JuiceOutput {
	const dt = 1000 / hz;
	let out = juice.update(from, combo);
	for (let t = from + dt; t <= to + 1e-6; t += dt) out = juice.update(t, combo);
	return { ...out };
}

describe("createJuice", () => {
	it("rests with no shake, no zoom, no aberration and the base light", () => {
		const j = createJuice({ reducedMotion: false });
		const out = j.update(0, 0);
		expect(out.shakeX).toBe(0);
		expect(out.shakeY).toBe(0);
		expect(out.zoom).toBe(1);
		expect(out.aberration).toBe(0);
		expect(out.overdrive).toBe(0);
		expect(out.light).toBeGreaterThan(0);
	});

	it("a kill shakes and punches the camera, then settles in ~120ms", () => {
		const j = createJuice({ reducedMotion: false });
		j.update(0, 0);
		j.kill(0, 1, false);
		const hit = { ...j.update(16, 1) };
		expect(Math.abs(hit.shakeX) + Math.abs(hit.shakeY)).toBeGreaterThan(0);
		expect(hit.zoom).toBeLessThan(1);
		const later = j.update(200, 1);
		expect(later.shakeX).toBe(0);
		expect(later.shakeY).toBe(0);
		expect(later.zoom).toBeCloseTo(1, 5);
	});

	it("kill shake grows with the combo multiplier", () => {
		const peak = (combo: number) => {
			const j = createJuice({ reducedMotion: false });
			j.update(0, combo);
			j.kill(0, combo, false);
			let m = 0;
			for (let t = 1; t <= 100; t += 1) {
				const o = j.update(t, combo);
				m = Math.max(m, Math.hypot(o.shakeX, o.shakeY));
			}
			return m;
		};
		expect(peak(20)).toBeGreaterThan(peak(1));
	});

	it("a breach spikes aberration that decays within 250ms", () => {
		const j = createJuice({ reducedMotion: false });
		j.update(0, 0);
		j.breach(0);
		expect(j.update(10, 0).aberration).toBeGreaterThan(20);
		expect(j.update(260, 0).aberration).toBe(0);
	});

	it("lifetimes are in milliseconds: 60Hz and 120Hz agree", () => {
		const a = createJuice({ reducedMotion: false });
		const b = createJuice({ reducedMotion: false });
		a.update(0, 12);
		b.update(0, 12);
		a.kill(0, 12, false);
		b.kill(0, 12, false);
		a.keystroke(0);
		b.keystroke(0);
		const at60 = sample(a, 12, 0, 50, 60);
		const at120 = sample(b, 12, 0, 50, 120);
		expect(at120.zoom).toBeCloseTo(at60.zoom, 5);
		expect(at120.light).toBeCloseTo(at60.light, 5);
		expect(at120.overdrive).toBeCloseTo(at60.overdrive, 5);
	});

	it("the light breathes on a keystroke and grows with the combo", () => {
		const j = createJuice({ reducedMotion: false });
		const rest = j.update(0, 0).light;
		j.keystroke(0);
		expect(j.update(16, 0).light).toBeGreaterThan(rest);
		expect(j.update(1000, 0).light).toBeCloseTo(rest, 3);

		const k = createJuice({ reducedMotion: false });
		k.update(0, 0);
		const grown = sample(k, 15, 0, 2000, 60).light;
		expect(grown).toBeGreaterThan(rest * 1.3);
	});

	it("overdrive eases in at x3 and out when the combo breaks", () => {
		const j = createJuice({ reducedMotion: false });
		j.update(0, 0);
		const on = sample(j, 10, 0, 1500, 60);
		expect(on.overdrive).toBeGreaterThan(0.95);
		expect(on.zoom).toBeLessThan(0.96);
		expect(on.bloom).toBeGreaterThan(
			sample(createJuice({ reducedMotion: false }), 0, 0, 10, 60).bloom,
		);
		expect(on.aberration).toBeGreaterThan(0);
		// one frame after the break it is still easing, not snapped off
		const mid = { ...j.update(1516, 0) };
		expect(mid.overdrive).toBeGreaterThan(0.5);
		const off = sample(j, 0, 1516, 4000, 60);
		expect(off.overdrive).toBeLessThan(0.01);
		expect(off.zoom).toBeCloseTo(1, 2);
	});

	it("flags a tier-up once when the multiplier climbs", () => {
		const j = createJuice({ reducedMotion: false });
		expect(j.update(0, 4).tierUp).toBe(false);
		expect(j.update(16, 5).tierUp).toBe(true);
		expect(j.update(32, 5).tierUp).toBe(false);
		expect(j.update(48, 0).tierUp).toBe(false);
	});

	it("reduced motion: no shake, punch, zoom or aberration; a static light", () => {
		const j = createJuice({ reducedMotion: true });
		const rest = j.update(0, 0).light;
		j.kill(0, 20, true);
		j.breach(0);
		j.keystroke(0);
		const out = sample(j, 20, 0, 2000, 60);
		for (let t = 2000; t < 2100; t += 16) {
			const o = j.update(t, 20);
			expect(o.shakeX).toBe(0);
			expect(o.shakeY).toBe(0);
			expect(o.zoom).toBe(1);
			expect(o.aberration).toBe(0);
		}
		expect(out.light).toBe(rest);
		// the colour of overdrive (bloom) still comes through
		expect(out.bloom).toBeGreaterThan(0);
	});

	it("overdrive breathes the light continuously and warms the bloom", () => {
		const j = createJuice({ reducedMotion: false });
		j.update(0, 0);
		sample(j, 12, 0, 2000, 60);
		const seen: number[] = [];
		for (let t = 2000; t <= 2600; t += 1000 / 60)
			seen.push(j.update(t, 12).light);
		expect(Math.max(...seen) - Math.min(...seen)).toBeGreaterThan(1);
		const od = j.update(2616, 12);
		const rest = createJuice({ reducedMotion: false }).update(0, 0);
		expect(od.bloomThreshold).toBeLessThan(rest.bloomThreshold);
	});

	it("a core collapse shakes and puts the light out", () => {
		const j = createJuice({ reducedMotion: false });
		j.update(0, 5);
		j.collapse(100);
		const hit = { ...j.update(150, 5) };
		expect(Math.hypot(hit.shakeX, hit.shakeY)).toBeGreaterThan(0);
		expect(j.update(800, 5).lightGain).toBeLessThan(0.05);
	});

	it("reduced motion: a collapse dims the light without shaking", () => {
		const j = createJuice({ reducedMotion: true });
		j.update(0, 5);
		j.collapse(0);
		const o = j.update(100, 5);
		expect(o.shakeX).toBe(0);
		expect(o.shakeY).toBe(0);
		expect(j.update(800, 5).lightGain).toBeLessThan(0.05);
	});
});
