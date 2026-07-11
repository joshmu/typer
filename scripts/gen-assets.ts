/**
 * Seeded, idempotent game-asset generator. Zero runtime deps — a hand-rolled
 * RGBA PNG encoder (no filtering, zlib via node:zlib) is the whole pipeline, so
 * the outputs are reviewable and reproducible from a fixed seed. Run with:
 *
 *   pnpm gen:assets
 *
 * Outputs (committed):
 *   public/game/particle.png  64x64  radial white→transparent spark sprite
 *   public/game/ground.png    512x512 tileable dark value-noise floor + grid
 *
 * Expected sha256 (printed on every run; update here if the recipe changes):
 *   particle.png  3fbd343bb0bc63600bc4bede40af81eef7a298efc9e31fca48a60f401f6351cb
 *   ground.png    0727068a8d3de2799c54865cf08571d87ba2b53a79b6dd0980f997927f64b697
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const SEED = 0x9e3779b9; // fixed golden-ratio seed — outputs stay byte-stable

// ---- deterministic RNG (mulberry32) — no Math.random / Date ----
function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// ---- PNG encoding (RGBA, filter 0) ----
const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		table[n] = c >>> 0;
	}
	return table;
})();

function crc32(buf: Buffer): number {
	let c = 0xffffffff;
	for (let i = 0; i < buf.length; i++) {
		c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
	}
	return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length, 0);
	const typeBuf = Buffer.from(type, "ascii");
	const body = Buffer.concat([typeBuf, data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body), 0);
	return Buffer.concat([len, body, crc]);
}

function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
	const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // color type RGBA
	ihdr[10] = 0; // compression
	ihdr[11] = 0; // filter
	ihdr[12] = 0; // interlace

	// prepend a filter byte (0 = none) to each scanline
	const stride = width * 4;
	const raw = Buffer.alloc((stride + 1) * height);
	for (let y = 0; y < height; y++) {
		raw[y * (stride + 1)] = 0;
		rgba.subarray(y * stride, y * stride + stride).forEach((v, i) => {
			raw[y * (stride + 1) + 1 + i] = v;
		});
	}
	const idat = deflateSync(raw, { level: 9 });
	return Buffer.concat([
		sig,
		chunk("IHDR", ihdr),
		chunk("IDAT", idat),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

function clampByte(v: number): number {
	if (v < 0) return 0;
	if (v > 255) return 255;
	return Math.round(v);
}

// ---- particle sprite: radial white core → transparent ----
function genParticle(size: number): Uint8Array {
	const rgba = new Uint8Array(size * size * 4);
	const c = (size - 1) / 2;
	const rmax = size / 2;
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const dx = x - c;
			const dy = y - c;
			const d = Math.sqrt(dx * dx + dy * dy) / rmax;
			let a = 1 - d;
			if (a < 0) a = 0;
			a = a * a; // sharper falloff
			const i = (y * size + x) * 4;
			rgba[i] = 255;
			rgba[i + 1] = 255;
			rgba[i + 2] = 255;
			rgba[i + 3] = clampByte(a * 255);
		}
	}
	return rgba;
}

// ---- tileable value-noise ground with faint grid ----
function smooth(t: number): number {
	return t * t * (3 - 2 * t);
}

function genGround(size: number): Uint8Array {
	const gridN = 8; // lattice cells across the tile (wraps for tileability)
	const rand = mulberry32(SEED);
	const lattice: number[] = [];
	for (let i = 0; i < gridN * gridN; i++) lattice.push(rand());

	const sample = (u: number, v: number): number => {
		const x0 = Math.floor(u) % gridN;
		const y0 = Math.floor(v) % gridN;
		const x1 = (x0 + 1) % gridN;
		const y1 = (y0 + 1) % gridN;
		const fx = smooth(u - Math.floor(u));
		const fy = smooth(v - Math.floor(v));
		const p00 = lattice[y0 * gridN + x0];
		const p10 = lattice[y0 * gridN + x1];
		const p01 = lattice[y1 * gridN + x0];
		const p11 = lattice[y1 * gridN + x1];
		const a = p00 + (p10 - p00) * fx;
		const b = p01 + (p11 - p01) * fx;
		return a + (b - a) * fy;
	};

	const cell = 64; // grid-line spacing in px
	const rgba = new Uint8Array(size * size * 4);
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const n = sample((x / size) * gridN, (y / size) * gridN); // 0..1
			let base = 0.09 + n * 0.06;
			if (x % cell === 0 || y % cell === 0) base += 0.05; // faint grid
			const i = (y * size + x) * 4;
			rgba[i] = clampByte(base * 0.8 * 255);
			rgba[i + 1] = clampByte(base * 0.85 * 255);
			rgba[i + 2] = clampByte(base * 1.3 * 255);
			rgba[i + 3] = 255;
		}
	}
	return rgba;
}

function main(): void {
	const outDir = join(
		dirname(fileURLToPath(import.meta.url)),
		"..",
		"public",
		"game",
	);
	mkdirSync(outDir, { recursive: true });

	const assets: { name: string; bytes: Buffer }[] = [
		{ name: "particle.png", bytes: encodePng(64, 64, genParticle(64)) },
		{ name: "ground.png", bytes: encodePng(512, 512, genGround(512)) },
	];

	for (const asset of assets) {
		const path = join(outDir, asset.name);
		writeFileSync(path, asset.bytes);
		const sha = createHash("sha256").update(asset.bytes).digest("hex");
		console.log(
			`${asset.name.padEnd(14)} ${sha}  (${asset.bytes.length} bytes)`,
		);
	}
}

main();
