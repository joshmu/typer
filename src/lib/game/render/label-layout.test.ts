import { describe, expect, it } from "vitest";
import { type LabelBox, layoutLabels } from "./label-layout";

const box = (x: number, bottom: number, w = 4, h = 2): LabelBox => ({
	x,
	bottom,
	halfW: w / 2,
	height: h,
});

const overlaps = (a: LabelBox, ay: number, b: LabelBox, by: number) =>
	Math.abs(a.x - b.x) < a.halfW + b.halfW &&
	ay < by + b.height &&
	by < ay + a.height;

describe("layoutLabels", () => {
	it("leaves labels that don't touch where they are", () => {
		const boxes = [box(-10, 0), box(10, 0), box(0, 8)];
		expect(layoutLabels(boxes, 100)).toEqual(
			[0, 8, 0].map((_, i) => boxes[i].bottom),
		);
	});

	it("lifts the higher of two overlapping labels clear of the lower", () => {
		const boxes = [box(0, 0), box(1, 1)];
		const y = layoutLabels(boxes, 100);
		expect(y[0]).toBe(0);
		expect(y[1]).toBeGreaterThanOrEqual(2);
		expect(overlaps(boxes[0], y[0], boxes[1], y[1])).toBe(false);
	});

	it("resolves a pile of three without any pair overlapping", () => {
		const boxes = [box(0, 0), box(0.5, 0.5), box(-0.5, 1)];
		const y = layoutLabels(boxes, 100);
		for (let i = 0; i < 3; i++) {
			for (let j = i + 1; j < 3; j++) {
				expect(overlaps(boxes[i], y[i], boxes[j], y[j])).toBe(false);
			}
		}
	});

	it("keeps every label's top under the HUD-safe line", () => {
		const boxes = [box(0, 9), box(20, 3)];
		const y = layoutLabels(boxes, 10);
		expect(y[0] + boxes[0].height).toBeLessThanOrEqual(10);
		expect(y[1]).toBe(3);
	});

	it("keeps a pile under the HUD-safe line without overlapping", () => {
		const boxes = [box(0, 6), box(0.5, 7), box(-0.5, 7.5)];
		const y = layoutLabels(boxes, 10);
		for (let i = 0; i < 3; i++) {
			expect(y[i] + boxes[i].height).toBeLessThanOrEqual(10);
			for (let j = i + 1; j < 3; j++) {
				expect(overlaps(boxes[i], y[i], boxes[j], y[j])).toBe(false);
			}
		}
	});

	it("leaves a pile clear of the HUD line as the lift placed it", () => {
		const boxes = [box(0, 0), box(0.5, 0.5), box(-0.5, 1)];
		expect(layoutLabels(boxes, 10)).toEqual(layoutLabels(boxes, 100));
	});
});
