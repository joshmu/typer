/**
 * Map a world-space heading (sim x, sim y=world z) to a Babylon `Sprite.angle`
 * so that a sprite authored facing NORTH (up) points along that heading under
 * the overhead orthographic camera (alpha = -π/2, looking straight down).
 *
 * The camera's screen-up corresponds to a fixed world axis; the sign/offset here
 * were calibrated against the visual probe (enemies move toward the core, so
 * their heads should point inward). A near-zero heading holds the last angle by
 * returning 0 (callers keep the previous value when velocity is negligible).
 */
const ANGLE_OFFSET = Math.PI; // calibrated so north-art faces the travel dir

export function spriteAngle(dx: number, dz: number): number {
	if (dx * dx + dz * dz < 1e-8) return 0;
	return Math.atan2(dx, dz) + ANGLE_OFFSET;
}
