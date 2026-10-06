import { describe, expect, it } from "vitest";
import { ARENA } from "./sim/state";
import {
	arenaInk,
	frameFor,
	inFrame,
	ORTHO_HALF,
	plateFontPx,
	REF_PPU,
	spawnFade,
	vignetteGradient,
} from "./view";

describe("frameFor", () => {
	it("frames ORTHO_HALF vertically on a landscape canvas, square cells", () => {
		const f = frameFor(1440, 900);
		expect(f.halfH).toBe(ORTHO_HALF);
		expect(f.halfW).toBeCloseTo(ORTHO_HALF * 1.6);
		expect(f.ppu).toBeCloseTo(900 / (2 * ORTHO_HALF));
		expect(f.ppu).toBeCloseTo(REF_PPU);
	});

	it("widens the short axis on a portrait canvas so side spawns get warning", () => {
		const f = frameFor(390, 844);
		expect(f.halfW).toBeGreaterThanOrEqual(20);
		expect(f.halfH).toBeGreaterThan(ORTHO_HALF);
		expect(f.halfW / f.halfH).toBeCloseTo(390 / 844);
		expect(f.ppu).toBeCloseTo(390 / (2 * f.halfW));
	});

	it("falls back to a square frame for a degenerate canvas", () => {
		for (const [w, h] of [
			[0, 0],
			[100, 0],
			[Number.NaN, 400],
		]) {
			const f = frameFor(w, h);
			expect(f.halfW).toBe(ORTHO_HALF);
			expect(f.halfH).toBe(ORTHO_HALF);
			expect(Number.isFinite(f.ppu)).toBe(true);
		}
	});
});

describe("plateFontPx", () => {
	it("lands word plates at 18-20 CSS px on the 1440x900 reference", () => {
		const px = plateFontPx(1440, 900);
		expect(px).toBeGreaterThanOrEqual(18);
		expect(px).toBeLessThanOrEqual(20);
	});

	it("stays legible on a phone and bounded on a large display", () => {
		expect(plateFontPx(390, 844)).toBeGreaterThanOrEqual(14);
		expect(plateFontPx(3840, 2160)).toBeLessThanOrEqual(24);
		expect(plateFontPx(2560, 1440)).toBeGreaterThan(plateFontPx(1440, 900));
	});
});

describe("spawnFade", () => {
	it("is opaque inside the ring and transparent at the spawn radius", () => {
		expect(spawnFade(0)).toBe(1);
		expect(spawnFade(ARENA.spawnRadius - 6)).toBe(1);
		expect(spawnFade(ARENA.spawnRadius)).toBe(0);
		expect(spawnFade(ARENA.spawnRadius + 5)).toBe(0);
	});

	it("ramps monotonically across the fade band", () => {
		const a = spawnFade(ARENA.spawnRadius - 1);
		const b = spawnFade(ARENA.spawnRadius - 2);
		expect(a).toBeGreaterThan(0);
		expect(b).toBeGreaterThan(a);
		expect(b).toBeLessThan(1);
	});
});

describe("vignetteGradient", () => {
	const alphas = (g: string) =>
		[...g.matchAll(/rgba\(\d+, \d+, \d+, ([\d.]+)\)/g)].map((m) =>
			Number(m[1]),
		);

	it("returns none for an unmeasured shell", () => {
		expect(vignetteGradient(0, 0)).toBe("none");
		expect(vignetteGradient(800, Number.NaN)).toBe("none");
		expect(vignetteGradient(-10, 400)).toBe("none");
	});

	it("is an ellipse sized from the shell that reaches the corners", () => {
		const g = vignetteGradient(1440, 900);
		const m = g.match(/ellipse (\d+)px (\d+)px at center/);
		expect(m).not.toBeNull();
		const rx = Number(m?.[1]);
		const ry = Number(m?.[2]);
		// the corner (720, 450) lies on or inside the ellipse edge
		expect((720 / rx) ** 2 + (450 / ry) ** 2).toBeLessThanOrEqual(1.01);
		expect(rx / ry).toBeCloseTo(1440 / 900, 1);
	});

	it("frames rather than hides: transparent centre, at most ~0.5 alpha", () => {
		const a = alphas(vignetteGradient(1440, 900));
		expect(a[0]).toBe(0);
		expect(Math.max(...a)).toBeLessThanOrEqual(0.55);
		expect(Math.max(...a)).toBeGreaterThanOrEqual(0.4);
		for (let i = 1; i < a.length; i++) {
			expect(a[i]).toBeGreaterThanOrEqual(a[i - 1]);
		}
	});

	it("rescales with the shell", () => {
		expect(vignetteGradient(800, 500)).not.toBe(vignetteGradient(1440, 900));
	});
});

describe("arenaInk", () => {
	it("keeps a dark theme's pairing: plate on bg, ink in text", () => {
		expect(arenaInk("#323437", "#d1d0c5")).toEqual({
			plate: "#323437",
			ink: "#d1d0c5",
		});
	});

	it("swaps a light theme's pairing so plates stay dark in the dark arena", () => {
		expect(arenaInk("#e1e1e3", "#323437")).toEqual({
			plate: "#323437",
			ink: "#e1e1e3",
		});
	});

	it("falls back to a dark pairing for unparseable colours", () => {
		const ink = arenaInk("", "var(--x)");
		expect(ink.plate).toMatch(/^#/);
		expect(ink.ink).toMatch(/^#/);
	});
});

describe("inFrame", () => {
	const f = frameFor(1440, 900);
	it("is true inside the camera window and false beyond it", () => {
		expect(inFrame(0, 0, f)).toBe(true);
		expect(inFrame(f.halfW - 1, f.halfH - 1, f)).toBe(true);
		expect(inFrame(0, f.halfH + 1, f)).toBe(false);
		expect(inFrame(-f.halfW - 1, 0, f)).toBe(false);
	});

	it("can require a margin inside the edge", () => {
		expect(inFrame(0, f.halfH - 1, f, 2)).toBe(false);
	});
});
