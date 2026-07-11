import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import type { Scene } from "@babylonjs/core/scene";

/**
 * Battlefield persistence via the Crimsonland technique: the ground's diffuse is
 * a single DynamicTexture. The AI terrain is drawn into it once (tiled 4×4 to
 * match the old uScale/vScale), then corpse and breach decals are stamped
 * straight into the same texture on death frames. There are NO live decal
 * entities and no per-frame cost — accumulation is unbounded for free, and
 * `texture.update()` is called only when something is actually stamped.
 */

export type GroundDecals = {
	texture: DynamicTexture;
	/** Stamp an enemy corpse (scorch + family-tinted splat + debris) at a world
	 * position. `seed` (enemy id) drives a stable random-ish rotation. */
	stampCorpse(
		x: number,
		y: number,
		color: [number, number, number],
		seed: number,
	): void;
	/** Stamp a red core-side scar where an enemy breached the core. */
	stampScar(x: number, y: number, seed: number): void;
	dispose(): void;
};

const SIZE = 2048;
const TAU = Math.PI * 2;
const TILES = 4; // match the previous terrain uScale/vScale of 4

// biome-ignore lint/suspicious/noExplicitAny: 2d canvas context, untyped here
type Ctx = any;

/** Stable pseudo-random angle in [0, TAU) from an integer seed (render-side). */
function seedAngle(seed: number): number {
	const h = (Math.imul(seed | 0, 0x9e3779b1) >>> 0) / 4294967296;
	return h * TAU;
}

export function createGroundDecals(
	scene: Scene,
	worldRadius: number,
): GroundDecals {
	const texture = new DynamicTexture(
		"ground-dynamic",
		{ width: SIZE, height: SIZE },
		scene,
		true,
	);
	const ctx = texture.getContext() as Ctx;

	// dark base fill so the disc is never a transparent/black hole before the
	// terrain image decodes
	ctx.fillStyle = "#0a0a12";
	ctx.fillRect(0, 0, SIZE, SIZE);
	texture.update();

	// bake the terrain image, tiled, into the texture once it loads
	const img = new Image();
	img.onload = () => {
		const tw = SIZE / TILES;
		for (let i = 0; i < TILES; i++) {
			for (let j = 0; j < TILES; j++) {
				ctx.drawImage(img, i * tw, j * tw, tw, tw);
			}
		}
		texture.update();
	};
	img.src = "/game/terrain.png";

	// world → canvas pixel. The ground disc (CreateDisc, rotated flat) maps world
	// (x, z=sim-y) linearly to uv centred at 0.5; the DynamicTexture samples with
	// v inverted, so canvas-y flips. Verified against corpse positions in the probe.
	const pxPerWorld = SIZE / (2 * worldRadius);
	function toCanvas(x: number, y: number): [number, number] {
		return [SIZE / 2 + x * pxPerWorld, SIZE / 2 - y * pxPerWorld];
	}

	function stampCorpse(
		x: number,
		y: number,
		color: [number, number, number],
		seed: number,
	): void {
		const [px, py] = toCanvas(x, y);
		const [r, g, b] = color;
		ctx.save();
		ctx.translate(px, py);
		ctx.rotate(seedAngle(seed));

		// dark scorch ellipse
		ctx.globalAlpha = 0.5;
		ctx.fillStyle = "rgba(6, 5, 9, 1)";
		ctx.beginPath();
		ctx.ellipse(0, 0, 34, 24, 0, 0, TAU);
		ctx.fill();

		// 2-3 family-tinted splat blobs
		const cr = Math.round(r * 200);
		const cg = Math.round(g * 200);
		const cb = Math.round(b * 200);
		ctx.globalAlpha = 0.4;
		ctx.fillStyle = `rgb(${cr}, ${cg}, ${cb})`;
		const blobs = 2 + (seed & 1);
		for (let i = 0; i < blobs; i++) {
			const a = seedAngle(seed + i * 97);
			const dx = Math.cos(a) * (10 + (seed % 11));
			const dy = Math.sin(a) * (8 + (seed % 7));
			ctx.beginPath();
			ctx.ellipse(dx, dy, 10 + i * 3, 7 + i * 2, a, 0, TAU);
			ctx.fill();
		}

		// debris flecks
		ctx.globalAlpha = 0.55;
		ctx.fillStyle = "rgba(20, 18, 22, 1)";
		for (let i = 0; i < 6; i++) {
			const a = seedAngle(seed * 3 + i * 53);
			const d = 12 + ((seed + i * 13) % 22);
			ctx.fillRect(Math.cos(a) * d, Math.sin(a) * d, 3, 3);
		}

		ctx.restore();
		ctx.globalAlpha = 1;
		texture.update();
	}

	function stampScar(x: number, y: number, seed: number): void {
		const [px, py] = toCanvas(x, y);
		ctx.save();
		ctx.translate(px, py);
		ctx.rotate(seedAngle(seed));
		// red core-side breach scar: a hot gash with a darker char halo
		ctx.globalAlpha = 0.45;
		ctx.fillStyle = "rgba(10, 3, 3, 1)";
		ctx.beginPath();
		ctx.ellipse(0, 0, 30, 20, 0, 0, TAU);
		ctx.fill();
		ctx.globalAlpha = 0.55;
		ctx.strokeStyle = "rgba(180, 30, 24, 1)";
		ctx.lineWidth = 4;
		ctx.beginPath();
		ctx.moveTo(-22, -6);
		ctx.lineTo(2, 4);
		ctx.lineTo(24, -8);
		ctx.stroke();
		ctx.beginPath();
		ctx.moveTo(-18, 8);
		ctx.lineTo(20, 10);
		ctx.stroke();
		ctx.restore();
		ctx.globalAlpha = 1;
		texture.update();
	}

	return {
		texture,
		stampCorpse,
		stampScar,
		dispose() {
			texture.dispose();
		},
	};
}
