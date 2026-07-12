import { describe, expect, it } from "vitest";
import { spriteAngle } from "./sprite-angle";

// Screen mapping under the ortho camera: +x = screen-right, +z = screen-up.
// Sprite.angle is counter-clockwise, art is authored facing north (up).
describe("spriteAngle", () => {
	it("holds (returns 0) for a negligible heading", () => {
		expect(spriteAngle(0, 0)).toBe(0);
		expect(spriteAngle(1e-6, -1e-6)).toBe(0);
	});

	it("keeps north-art unrotated when heading up-screen", () => {
		expect(spriteAngle(0, 1)).toBeCloseTo(0);
	});

	it("flips to face down-screen (the old +π form mirrored this axis)", () => {
		expect(Math.abs(spriteAngle(0, -1))).toBeCloseTo(Math.PI);
	});

	it("rotates clockwise (negative) to face screen-right", () => {
		expect(spriteAngle(1, 0)).toBeCloseTo(-Math.PI / 2);
	});

	it("rotates counter-clockwise (positive) to face screen-left", () => {
		expect(spriteAngle(-1, 0)).toBeCloseTo(Math.PI / 2);
	});
});
