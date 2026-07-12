import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Scene } from "@babylonjs/core/scene";

/**
 * Battlefield persistence via the Crimsonland technique: the ground's diffuse is
 * a single DynamicTexture. The pixel-art terrain is drawn into it once (a centre
 * square crop scaled across the whole floor, imageSmoothing OFF so the chunky
 * pixels stay crisp under the ortho camera), then corpse and breach decals are
 * stamped straight into the same texture on death frames — chunky opaque pixel
 * blood/goo clusters. There are NO live decal entities and no per-frame cost;
 * accumulation is unbounded for free, and the single GPU `texture.update()` is
 * deferred to `flush()` (once per frame) so any number of stamps cost one upload.
 */

export type GroundDecals = {
	texture: DynamicTexture;
	/** Stamp an enemy corpse (chunky family-tinted blood cluster) at a world
	 * position. `seed` (enemy id) drives a stable random-ish layout. */
	stampCorpse(
		x: number,
		y: number,
		color: [number, number, number],
		seed: number,
	): void;
	/** Stamp a red core-side scar where an enemy breached the core. */
	stampScar(x: number, y: number, seed: number): void;
	/** Upload the accumulated stamps to the GPU once, if anything was stamped
	 * since the last flush. Call once per frame after processing deaths. */
	flush(): void;
	dispose(): void;
};

const SIZE = 2048;
const TAU = Math.PI * 2;
const CHUNK = 3; // texture px per blood "pixel" — chunky, hard-edged goo (~0.4 world units)

// biome-ignore lint/suspicious/noExplicitAny: 2d canvas context, untyped here
type Ctx = any;

/** Stable pseudo-random unit in [0,1) from an integer seed (render-side). */
function seedRand(seed: number): number {
	return (Math.imul(seed | 0, 0x9e3779b1) >>> 0) / 4294967296;
}

export function createGroundDecals(
	scene: Scene,
	worldRadius: number,
): GroundDecals {
	// generateMipMaps=false: the ground is viewed at a fixed near-top-down zoom,
	// so mip levels are never sampled — skipping them avoids the full-chain
	// regeneration the GPU would otherwise run on every texture.update().
	const texture = new DynamicTexture(
		"ground-dynamic",
		{ width: SIZE, height: SIZE },
		scene,
		false,
	);
	// crisp pixels: NEAREST sampling on the GPU, and no canvas smoothing on any
	// draw (terrain blit AND decal stamps) so nothing gets bilinear-blurred
	texture.updateSamplingMode(Texture.NEAREST_SAMPLINGMODE);
	const ctx = texture.getContext() as Ctx;
	ctx.imageSmoothingEnabled = false;
	// set by stamps, cleared by flush(): batches all of a frame's decal draws
	// into a single GPU upload
	let dirty = false;

	// dark base fill so the disc is never a transparent/black hole before the
	// terrain image decodes
	ctx.fillStyle = "#0f0d0c";
	ctx.fillRect(0, 0, SIZE, SIZE);
	texture.update();

	// bake the pixel terrain once it loads: a CENTRE SQUARE crop TILED 4×4 across
	// the floor. A single stretch put one image over the whole 290-unit disc —
	// each metal plate read building-sized on screen (playtest: "bg scaled too
	// much"). Tiling shrinks the features 4× while imageSmoothing stays off so
	// the pixels remain hard-edged.
	const TILES = 4;
	const img = new Image();
	img.onload = () => {
		const side = Math.min(img.width, img.height);
		const sx = (img.width - side) / 2;
		const sy = (img.height - side) / 2;
		ctx.imageSmoothingEnabled = false;
		const tile = SIZE / TILES;
		for (let ty = 0; ty < TILES; ty++) {
			for (let tx = 0; tx < TILES; tx++) {
				ctx.drawImage(
					img,
					sx,
					sy,
					side,
					side,
					tx * tile,
					ty * tile,
					tile,
					tile,
				);
			}
		}
		texture.update();
	};
	img.src = "/game/terrain.png";

	// world → canvas pixel. The ground disc maps world (x, z=sim-y) linearly to uv
	// centred at 0.5; the DynamicTexture samples with v inverted, so canvas-y flips.
	const pxPerWorld = SIZE / (2 * worldRadius);
	function toCanvas(x: number, y: number): [number, number] {
		return [SIZE / 2 + x * pxPerWorld, SIZE / 2 - y * pxPerWorld];
	}

	/** Fill one grid-aligned chunky "pixel" so every stamp shares a pixel grid. */
	function chunkAt(cx: number, cy: number, fill: string): void {
		const gx = Math.round(cx / CHUNK) * CHUNK;
		const gy = Math.round(cy / CHUNK) * CHUNK;
		ctx.fillStyle = fill;
		ctx.fillRect(gx, gy, CHUNK, CHUNK);
	}

	/** A hard-edged filled disc of chunks (radius in world units). */
	function blob(px: number, py: number, worldR: number, fill: string): void {
		const r = worldR * pxPerWorld;
		for (let dy = -r; dy <= r; dy += CHUNK) {
			for (let dx = -r; dx <= r; dx += CHUNK) {
				if (dx * dx + dy * dy <= r * r) chunkAt(px + dx, py + dy, fill);
			}
		}
	}

	function stampCorpse(
		x: number,
		y: number,
		color: [number, number, number],
		seed: number,
	): void {
		const [px, py] = toCanvas(x, y);
		const [r, g, b] = color;
		const main = `rgb(${Math.round(r * 190)}, ${Math.round(g * 190)}, ${Math.round(b * 190)})`;
		const dark = `rgb(${Math.round(r * 90)}, ${Math.round(g * 90)}, ${Math.round(b * 90)})`;

		// a central pool plus 3–4 satellite gouts, all chunky and opaque so the
		// kill leaves a clearly-visible mark — sized against the ~2-unit creatures
		blob(px, py, 0.7, dark);
		blob(px, py, 0.55, main);
		const gouts = 3 + (seed % 2);
		for (let i = 0; i < gouts; i++) {
			const a = seedRand(seed * 31 + i * 97) * TAU;
			const d = (0.5 + seedRand(seed + i * 13) * 0.6) * pxPerWorld;
			const gx = px + Math.cos(a) * d;
			const gy = py + Math.sin(a) * d;
			blob(gx, gy, 0.2 + seedRand(seed + i * 7) * 0.2, i % 2 ? dark : main);
		}
		// a few dark specks flung further out
		for (let i = 0; i < 5; i++) {
			const a = seedRand(seed * 7 + i * 53) * TAU;
			const d = (0.8 + seedRand(seed + i * 17) * 0.5) * pxPerWorld;
			chunkAt(px + Math.cos(a) * d, py + Math.sin(a) * d, dark);
		}
		dirty = true;
	}

	function stampScar(x: number, y: number, seed: number): void {
		const [px, py] = toCanvas(x, y);
		// red core-side breach scar: a chunky char pool with a hot red gash
		blob(px, py, 0.65, "rgb(18, 8, 8)");
		blob(px, py, 0.4, "rgb(120, 26, 22)");
		for (let i = 0; i < 6; i++) {
			const a = seedRand(seed * 19 + i * 41) * TAU;
			const d = (0.25 + seedRand(seed + i * 11) * 0.55) * pxPerWorld;
			chunkAt(px + Math.cos(a) * d, py + Math.sin(a) * d, "rgb(180, 40, 30)");
		}
		dirty = true;
	}

	function flush(): void {
		if (!dirty) return;
		texture.update();
		dirty = false;
	}

	return {
		texture,
		stampCorpse,
		stampScar,
		flush,
		dispose() {
			texture.dispose();
		},
	};
}
