/**
 * Map a world-space heading (sim x, sim y=world z) to a Babylon `Sprite.angle`
 * so that a sprite authored facing NORTH (up) points along that heading under
 * the overhead orthographic camera (alpha = -π/2, looking straight down).
 *
 * Screen axes under that camera: +x is screen-right, +z is screen-up, and
 * Sprite.angle rotates counter-clockwise — rotating north-art by φ points it
 * along (-sin φ, cos φ) in screen space, so φ = atan2(-dx, dz). (The old
 * `atan2(dx, dz) + π` form equals atan2(-dx, -dz): it MIRRORED the vertical
 * axis, so anything heading down-screen rendered facing up-screen — the
 * playtest "turret ~90° off from its bullets" on diagonal shots.) A near-zero
 * heading returns 0; callers keep the previous value when velocity is
 * negligible.
 */
export function spriteAngle(dx: number, dz: number): number {
	if (dx * dx + dz * dz < 1e-8) return 0;
	return Math.atan2(-dx, dz);
}
