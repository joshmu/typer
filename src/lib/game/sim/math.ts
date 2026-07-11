import { nextFloat } from "./rng";
import type { Vec2 } from "./state";

/**
 * Deterministic math helpers for the pure simulation. The ES spec leaves the
 * built-in trig approximations (cosine/sine/tangent) and the hypotenuse helper
 * implementation-defined (not bit-identical across engines), while the square
 * root, rounding and `+ - * /` are exact. The sim/content sources use ONLY
 * these helpers so seeded replays and golden fixtures stay valid on every JS
 * engine.
 */

const PI = Math.PI;
const TWO_PI = PI * 2;
const HALF_PI = PI / 2;

/** Euclidean length using only the correctly-rounded sqrt. */
export function dist(x: number, y: number): number {
	return Math.sqrt(x * x + y * y);
}

/**
 * Deterministic sine. Range-reduces the angle to [-π, π] with arithmetic only
 * (Math.round is exact), then evaluates a degree-13 Taylor polynomial in Horner
 * form. Accuracy is asserted within 2e-3 of the built-in over [-10π, 10π].
 */
export function sinR(rad: number): number {
	// range reduction to [-π, π]
	const k = Math.round(rad / TWO_PI);
	const r = rad - k * TWO_PI;
	const z = r * r;
	return (
		r *
		(1 +
			z *
				(-1 / 6 +
					z *
						(1 / 120 +
							z *
								(-1 / 5040 +
									z *
										(1 / 362880 +
											z * (-1 / 39916800 + z * (1 / 6227020800)))))))
	);
}

/** Deterministic cosine, expressed via the sine approximation. */
export function cosR(rad: number): number {
	return sinR(rad + HALF_PI);
}

/**
 * Deterministic uniform point on a circle of the given radius. The built-in
 * trig approximations are implementation-defined, so we rejection-sample a
 * point in the unit disc (only +,-,*,/ and sqrt) and project it onto the
 * circle. Each rejected iteration advances the rng state, keeping the draw
 * deterministic.
 */
export function randomPointOnCircle(
	rngState: number,
	radius: number,
): [pos: Vec2, next: number] {
	let state = rngState;
	let ux = 0;
	let uy = 0;
	let len2 = 0;
	do {
		const [fx, r1] = nextFloat(state);
		const [fy, r2] = nextFloat(r1);
		state = r2;
		ux = fx * 2 - 1;
		uy = fy * 2 - 1;
		len2 = ux * ux + uy * uy;
	} while (len2 > 1 || len2 < 0.0001);
	const len = Math.sqrt(len2);
	return [{ x: (ux / len) * radius, y: (uy / len) * radius }, state];
}
