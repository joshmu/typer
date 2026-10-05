import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Scene } from "@babylonjs/core/scene";

/**
 * Battlefield persistence via the Crimsonland technique: a transparent
 * DynamicTexture laid over the floor. Corpse and breach decals are stamped
 * straight into it on death frames as hard-edged pixel clusters sharing one
 * pixel grid (imageSmoothing off, NEAREST sampling). There are no live decal
 * entities and no per-frame cost; the single GPU `texture.update()` is
 * deferred to `flush()` so any number of stamps cost one upload per frame.
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
const CHUNK = 2; // texture px per decal "pixel": ~0.1 world units, the floor art's own grain

// biome-ignore lint/suspicious/noExplicitAny: 2d canvas context, untyped here
type Ctx = any;

/** Stable pseudo-random unit in [0,1) from an integer seed (render-side). */
function seedRand(seed: number): number {
	return (Math.imul(seed | 0, 0x9e3779b1) >>> 0) / 4294967296;
}

export function createGroundDecals(
	scene: Scene,
	worldRadius: number,
	/** stamps beyond this radius fade out toward worldRadius, with the floor */
	fadeFrom: number,
): GroundDecals {
	// generateMipMaps=false: the floor is viewed at a fixed top-down zoom, so
	// skipping mips avoids regenerating the chain on every texture.update()
	const texture = new DynamicTexture(
		"ground-decals",
		{ width: SIZE, height: SIZE },
		scene,
		false,
	);
	texture.hasAlpha = true;
	texture.updateSamplingMode(Texture.NEAREST_SAMPLINGMODE);
	const ctx = texture.getContext() as Ctx;
	ctx.imageSmoothingEnabled = false;
	ctx.clearRect(0, 0, SIZE, SIZE);
	texture.update();
	// set by stamps, cleared by flush(): one GPU upload per frame
	let dirty = false;

	// world → canvas pixel. The ground disc maps world (x, z=sim-y) linearly to
	// uv centred at 0.5. NO y flip: probe-verified — the disc's UV orientation
	// under its rotation.x=π/2 plus the DynamicTexture upload cancel out, and
	// the old `SIZE/2 - y` form mirrored every decal across the horizontal axis
	// (playtest: "remains show up in the wrong place").
	const pxPerWorld = SIZE / (2 * worldRadius);
	function toCanvas(x: number, y: number): [number, number] {
		return [SIZE / 2 + x * pxPerWorld, SIZE / 2 + y * pxPerWorld];
	}

	/** Stamp opacity at a world point: full on the solid floor, fading to 0 at
	 * the disc edge the same way the floor does. */
	function edgeAlpha(x: number, y: number): number {
		const d = Math.sqrt(x * x + y * y);
		const t = (worldRadius - d) / (worldRadius - fadeFrom);
		return t <= 0 ? 0 : t >= 1 ? 1 : t;
	}

	/** Fill one grid-aligned chunky "pixel" so every stamp shares a pixel grid. */
	function chunkAt(cx: number, cy: number, fill: string): void {
		const gx = Math.round(cx / CHUNK) * CHUNK;
		const gy = Math.round(cy / CHUNK) * CHUNK;
		ctx.fillStyle = fill;
		ctx.fillRect(gx, gy, CHUNK, CHUNK);
	}

	/** A hard-edged filled disc of chunks (radius in world units). */
	function blob(
		px: number,
		py: number,
		worldR: number,
		fill: string,
		/** optional second fill dithered in, so a pool reads as pixel grime
		 * rather than a flat paint dot */
		speckle?: string,
	): void {
		const r = worldR * pxPerWorld;
		for (let dy = -r; dy <= r; dy += CHUNK) {
			for (let dx = -r; dx <= r; dx += CHUNK) {
				const d2 = dx * dx + dy * dy;
				if (d2 > r * r) continue;
				const gx = Math.round((px + dx) / CHUNK);
				const gy = Math.round((py + dy) / CHUNK);
				// ragged rim: drop some edge chunks
				const n = seedRand(gx * 73856093 + gy * 19349663);
				if (d2 > r * r * 0.6 && n < 0.35) continue;
				chunkAt(px + dx, py + dy, speckle && n > 0.72 ? speckle : fill);
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
		ctx.globalAlpha = edgeAlpha(x, y);
		const [r, g, b] = color;
		// muted against the dim deck: a stain, not a paint dot
		const main = `rgb(${Math.round(r * 135)}, ${Math.round(g * 135)}, ${Math.round(b * 135)})`;
		const dark = `rgb(${Math.round(r * 60)}, ${Math.round(g * 60)}, ${Math.round(b * 60)})`;

		// a central pool plus 3–4 satellite gouts, all chunky and opaque so the
		// kill leaves a clearly-visible mark, sized against the ~3-unit creatures
		blob(px, py, 0.9, dark);
		blob(px, py, 0.7, main, dark);
		const gouts = 3 + (seed % 2);
		for (let i = 0; i < gouts; i++) {
			const a = seedRand(seed * 31 + i * 97) * TAU;
			const d = (0.7 + seedRand(seed + i * 13) * 0.8) * pxPerWorld;
			const gx = px + Math.cos(a) * d;
			const gy = py + Math.sin(a) * d;
			blob(gx, gy, 0.25 + seedRand(seed + i * 7) * 0.25, i % 2 ? dark : main);
		}
		// a few dark specks flung further out
		for (let i = 0; i < 7; i++) {
			const a = seedRand(seed * 7 + i * 53) * TAU;
			const d = (1.1 + seedRand(seed + i * 17) * 0.7) * pxPerWorld;
			chunkAt(px + Math.cos(a) * d, py + Math.sin(a) * d, dark);
		}
		ctx.globalAlpha = 1;
		dirty = true;
	}

	function stampScar(x: number, y: number, seed: number): void {
		const [px, py] = toCanvas(x, y);
		ctx.globalAlpha = edgeAlpha(x, y);
		// a breach scorches the deck beside the core: soft layered char (each
		// layer translucent so repeat breaches darken it), a few cracks
		// radiating out, and a couple of dim embers, all on the shared grid
		blob(px, py, 1.1, "rgba(6, 4, 4, 0.28)");
		blob(px, py, 0.75, "rgba(6, 4, 4, 0.4)");
		blob(px, py, 0.4, "rgba(10, 6, 5, 0.6)");
		const cracks = 4 + (seed % 3);
		for (let i = 0; i < cracks; i++) {
			const a = seedRand(seed * 19 + i * 41) * TAU;
			const len = (0.8 + seedRand(seed + i * 11) * 0.9) * pxPerWorld;
			for (let d = 0; d < len; d += CHUNK) {
				// a slight wobble so the crack reads as torn plate, not a ruled line
				const wob = Math.sin(d * 0.35 + i) * CHUNK;
				chunkAt(
					px + Math.cos(a) * d - Math.sin(a) * wob,
					py + Math.sin(a) * d + Math.cos(a) * wob,
					"rgba(4, 3, 3, 0.75)",
				);
			}
		}
		for (let i = 0; i < 3; i++) {
			const a = seedRand(seed * 23 + i * 29) * TAU;
			const d = seedRand(seed + i * 5) * 0.5 * pxPerWorld;
			chunkAt(
				px + Math.cos(a) * d,
				py + Math.sin(a) * d,
				"rgba(190, 80, 30, 0.55)",
			);
		}
		ctx.globalAlpha = 1;
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
