/**
 * Curated, MANUALLY-run sprite generator for Horde mode's 2D pixel-art pivot.
 *
 *   OPENROUTER_API_KEY=... node scripts/gen-sprites.mjs [options]
 *
 * Generates per-family creature sprites (2 walk poses each), a top-down hero
 * (idle + recoil), plus procedural dot/crystal cells, and packs everything into
 * ONE uniform 64x64-cell atlas for Babylon's SpriteManager:
 *
 *   public/game/sprites.png    the packed atlas (committed)
 *   public/game/sprites.json   name -> cellIndex manifest + provenance (committed)
 *
 * Pipeline per AI cell:
 *   OpenRouter (google/gemini-3.1-flash-image) with a magenta-background prompt
 *   -> decode + chroma-key magenta -> auto-crop -> NEAREST downscale to 64px
 *      -> quantize to <=24 colours -> pack into the atlas grid.
 *
 * Decode/crop/downscale run in a headless Chromium canvas (the model returns
 * mixed PNG/JPEG bytes that pure node cannot decode); quantize + atlas pack +
 * PNG encode are pure node (the encoder mirrors scripts/gen-assets.ts). Accepted
 * cells are cached under .sprites-cache/ (gitignored) so a re-roll of one family
 * never regenerates the rest.
 *
 * This is a PROVENANCE script, NOT a build step — CI never calls the network.
 * The committed sprites.png / sprites.json are the artifacts of record. NEVER
 * commit the API key.
 *
 * Options:
 *   --only a,b       regenerate only these cell keys or families (others cached)
 *   --proc a,b       force procedural fallback for these families/keys
 *   --pack-only      skip generation; just repack the atlas from the cache
 *   --rerolls N      max AI attempts per cell before falling back (default 3)
 *   --seed N         procedural RNG seed (default golden ratio)
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { chromium } from "@playwright/test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "public", "game");
const CACHE_DIR = join(ROOT, ".sprites-cache");
const KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.AI_IMAGE_MODEL || "google/gemini-3.1-flash-image";
const CELL = 64; // atlas cell size (px), uniform for Babylon SpriteManager
const MAX_COLORS = 24;

function argFlag(name) {
	return process.argv.includes(`--${name}`);
}
function argVal(name, fallback) {
	const i = process.argv.indexOf(`--${name}`);
	if (i === -1) return fallback;
	const v = process.argv[i + 1];
	return v && !v.startsWith("--") ? v : fallback;
}
const ONLY = argVal("only", "");
const PROC = new Set(argVal("proc", "").split(",").filter(Boolean));
const PACK_ONLY = argFlag("pack-only");
const REROLLS = Number(argVal("rerolls", "3"));
const SEED = Number(argVal("seed", String(0x9e3779b9)));

// ---------------------------------------------------------------------------
// PNG encoder (RGBA, filter 0) — mirrors scripts/gen-assets.ts
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();
function crc32(buf) {
	let c = 0xffffffff;
	for (let i = 0; i < buf.length; i++)
		c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length, 0);
	const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body), 0);
	return Buffer.concat([len, body, crc]);
}
function encodePng(width, height, rgba) {
	const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8;
	ihdr[9] = 6;
	const stride = width * 4;
	const raw = Buffer.alloc((stride + 1) * height);
	for (let y = 0; y < height; y++) {
		raw[y * (stride + 1)] = 0;
		for (let i = 0; i < stride; i++)
			raw[y * (stride + 1) + 1 + i] = rgba[y * stride + i];
	}
	const idat = deflateSync(raw, { level: 9 });
	return Buffer.concat([
		sig,
		chunk("IHDR", ihdr),
		chunk("IDAT", idat),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

// ---------------------------------------------------------------------------
// deterministic RNG (mulberry32) for procedural painters — no Math.random
// ---------------------------------------------------------------------------
function mulberry32(seed) {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// ---------------------------------------------------------------------------
// Family palettes (mirror render/visuals.ts FAMILY_VISUALS, 0..255)
// ---------------------------------------------------------------------------
const PALETTE = {
	husk: { base: [217, 64, 77], dark: [120, 26, 34], hi: [255, 150, 150] },
	darter: { base: [242, 153, 38], dark: [140, 78, 12], hi: [255, 214, 140] },
	wraith: { base: [153, 89, 242], dark: [70, 36, 130], hi: [206, 178, 255] },
	charger: { base: [89, 217, 102], dark: [30, 110, 40], hi: [180, 255, 190] },
	weaver: { base: [77, 204, 230], dark: [24, 90, 110], hi: [180, 240, 255] },
	brood: { base: [242, 89, 179], dark: [130, 30, 90], hi: [255, 180, 220] },
	boss: { base: [255, 217, 51], dark: [150, 110, 20], hi: [255, 245, 180] },
	hero: { base: [90, 170, 230], dark: [30, 70, 120], hi: [200, 235, 255] },
};

// ---------------------------------------------------------------------------
// Cell manifest — ordered; index in this list is NOT the cellIndex (that is
// assigned at pack time), but the order is stable so packing is deterministic.
// ---------------------------------------------------------------------------
const BRIEFS = {
	husk: "a bloated shambling zombie-alien husk, lumpy rotten flesh, stubby limbs",
	darter:
		"a sleek fast spider-wasp, bright orange and black body, sharp legs and a barbed orange abdomen",
	wraith:
		"a spectral floating horror, tattered wispy shroud around a glowing core",
	charger: "an armored beetle-brute, thick chitin carapace and a horned head",
	weaver: "a twin-headed spider, two bulbous heads and many splayed legs",
	brood:
		"a swollen egg-sac spider-mother, round bloated body clustered with eggs",
	boss: "a huge menacing hulking alien overlord, one clear bold symmetric silhouette, golden spiked armor plates and glaring eyes, not a messy cluster",
};

function cellList() {
	const cells = [];
	for (const family of Object.keys(BRIEFS)) {
		for (let pose = 0; pose < 2; pose++) {
			cells.push({
				key: `${family}-walk-${pose}`,
				family,
				pose,
				kind: "creature",
				prompt:
					`16-bit pixel art sprite, top-down overhead view looking straight down, ` +
					`facing north (up), ${BRIEFS[family]}, ${pose === 0 ? "legs/limbs mid-stride pose A" : "legs/limbs opposite-stride pose B"}, ` +
					`centered, chunky readable pixels, high contrast, plain solid magenta background #FF00FF, no shadow, 128x128`,
			});
		}
	}
	// hero: idle + recoil (top-down marine/turret gunner)
	cells.push({
		key: "hero-idle",
		family: "hero",
		pose: 0,
		kind: "hero",
		prompt:
			"16-bit pixel art sprite, top-down overhead view looking straight down, " +
			"a sci-fi space marine turret gunner seen from directly above, holding a rifle pointing north (up), " +
			"armored shoulders, centered, chunky readable pixels, high contrast, plain solid magenta background #FF00FF, no shadow, 128x128",
	});
	cells.push({
		key: "hero-recoil",
		family: "hero",
		pose: 1,
		kind: "hero",
		prompt:
			"16-bit pixel art sprite, top-down overhead view looking straight down, " +
			"a sci-fi space marine turret gunner seen from directly above, rifle firing north with muzzle flash and recoil kick, " +
			"armored shoulders, centered, chunky readable pixels, high contrast, plain solid magenta background #FF00FF, no shadow, 128x128",
	});
	// procedural-only utility cells
	cells.push({ key: "dot", family: "dot", kind: "proc-dot" });
	cells.push({ key: "crystal", family: "crystal", kind: "proc-crystal" });
	return cells;
}

// ---------------------------------------------------------------------------
// OpenRouter image generation (mirrors scripts/gen-ai-assets.mjs parsing)
// ---------------------------------------------------------------------------
async function generateImage(prompt) {
	const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${KEY}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model: MODEL,
			modalities: ["image", "text"],
			messages: [{ role: "user", content: prompt }],
		}),
	});
	if (!res.ok) {
		console.error(`  HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
		return null;
	}
	const json = await res.json();
	const msg = json.choices?.[0]?.message;
	let dataUrl;
	if (Array.isArray(msg?.images) && msg.images[0])
		dataUrl = msg.images[0].image_url?.url ?? msg.images[0].url;
	if (!dataUrl && typeof msg?.content === "string") {
		const m = msg.content.match(/data:image\/[a-zA-Z]+;base64,[A-Za-z0-9+/=]+/);
		if (m) dataUrl = m[0];
	}
	if (!dataUrl && Array.isArray(msg?.content)) {
		for (const part of msg.content) {
			const url = part?.image_url?.url ?? part?.url;
			if (typeof url === "string" && url.startsWith("data:image")) {
				dataUrl = url;
				break;
			}
		}
	}
	return dataUrl ?? null;
}

// Decode + chroma-key + auto-crop + NEAREST downscale to CELL, in a browser canvas.
// Returns a flat RGBA Uint8Array of length CELL*CELL*4, or null on total failure.
async function processInBrowser(page, dataUrl) {
	const arr = await page.evaluate(
		async ({ dataUrl, CELL }) => {
			const img = new Image();
			img.src = dataUrl;
			try {
				await img.decode();
			} catch {
				return null;
			}
			const w = img.naturalWidth;
			const h = img.naturalHeight;
			if (!w || !h) return null;
			const c = document.createElement("canvas");
			c.width = w;
			c.height = h;
			const ctx = c.getContext("2d", { willReadFrequently: true });
			ctx.imageSmoothingEnabled = false;
			ctx.drawImage(img, 0, 0);
			const src = ctx.getImageData(0, 0, w, h).data;
			const out = new Uint8ClampedArray(src.length);
			let minx = w;
			let miny = h;
			let maxx = -1;
			let maxy = -1;
			let opaque = 0;
			for (let i = 0; i < w * h; i++) {
				const r = src[i * 4];
				const g = src[i * 4 + 1];
				const b = src[i * 4 + 2];
				// magenta key: strong red+blue, weak green (tolerant to jpeg ringing)
				const isMagenta =
					r > 135 && b > 135 && g < 115 && r - g > 45 && b - g > 45;
				if (isMagenta) {
					out[i * 4 + 3] = 0;
				} else {
					out[i * 4] = r;
					out[i * 4 + 1] = g;
					out[i * 4 + 2] = b;
					out[i * 4 + 3] = 255;
					opaque++;
					const x = i % w;
					const y = (i / w) | 0;
					if (x < minx) minx = x;
					if (x > maxx) maxx = x;
					if (y < miny) miny = y;
					if (y > maxy) maxy = y;
				}
			}
			if (maxx < minx || opaque < 16) return null;
			ctx.putImageData(new ImageData(out, w, h), 0, 0);
			const bw = maxx - minx + 1;
			const bh = maxy - miny + 1;
			// downscale the cropped subject into CELL preserving aspect, centered,
			// with a 2px margin so nothing touches the cell edge
			const fit = CELL - 4;
			const scale = Math.min(fit / bw, fit / bh);
			const dw = Math.max(1, Math.round(bw * scale));
			const dh = Math.max(1, Math.round(bh * scale));
			const oc = document.createElement("canvas");
			oc.width = CELL;
			oc.height = CELL;
			const octx = oc.getContext("2d", { willReadFrequently: true });
			octx.imageSmoothingEnabled = false;
			octx.clearRect(0, 0, CELL, CELL);
			const ox = Math.floor((CELL - dw) / 2);
			const oy = Math.floor((CELL - dh) / 2);
			octx.drawImage(c, minx, miny, bw, bh, ox, oy, dw, dh);
			return Array.from(octx.getImageData(0, 0, CELL, CELL).data);
		},
		{ dataUrl, CELL },
	);
	return arr ? Uint8Array.from(arr) : null;
}

// ---------------------------------------------------------------------------
// Quantize an RGBA cell to <= MAX_COLORS opaque colours (median cut).
// ---------------------------------------------------------------------------
function quantize(rgba, maxColors) {
	const pixels = [];
	for (let i = 0; i < rgba.length; i += 4) {
		if (rgba[i + 3] >= 128) pixels.push([rgba[i], rgba[i + 1], rgba[i + 2], i]);
	}
	if (pixels.length === 0) return rgba;
	const boxes = [pixels];
	while (boxes.length < maxColors) {
		// split the box with the largest channel range
		let bi = -1;
		let bestRange = -1;
		let bestCh = 0;
		for (let k = 0; k < boxes.length; k++) {
			const box = boxes[k];
			if (box.length < 2) continue;
			for (let ch = 0; ch < 3; ch++) {
				let lo = 255;
				let hi = 0;
				for (const p of box) {
					if (p[ch] < lo) lo = p[ch];
					if (p[ch] > hi) hi = p[ch];
				}
				const range = hi - lo;
				if (range > bestRange) {
					bestRange = range;
					bi = k;
					bestCh = ch;
				}
			}
		}
		if (bi === -1 || bestRange <= 0) break;
		const box = boxes[bi];
		box.sort((a, b) => a[bestCh] - b[bestCh]);
		const mid = box.length >> 1;
		boxes.splice(bi, 1, box.slice(0, mid), box.slice(mid));
	}
	const out = Uint8Array.from(rgba);
	for (const box of boxes) {
		let r = 0;
		let g = 0;
		let b = 0;
		for (const p of box) {
			r += p[0];
			g += p[1];
			b += p[2];
		}
		const n = box.length;
		r = Math.round(r / n);
		g = Math.round(g / n);
		b = Math.round(b / n);
		for (const p of box) {
			out[p[3]] = r;
			out[p[3] + 1] = g;
			out[p[3] + 2] = b;
		}
	}
	return out;
}

// ---------------------------------------------------------------------------
// Procedural pixel painters — creature-like fallbacks, 2 poses via `pose`.
// Each returns an RGBA Uint8Array of CELL*CELL*4. Hard-edged, symmetric.
// ---------------------------------------------------------------------------
function painter(family, pose, kind) {
	const buf = new Uint8Array(CELL * CELL * 4);
	const rand = mulberry32(
		SEED ^
			(family.split("").reduce((a, ch) => a + ch.charCodeAt(0), 0) << 8) ^
			(pose << 4),
	);
	const set = (x, y, [r, g, b], a = 255) => {
		x = Math.round(x);
		y = Math.round(y);
		if (x < 0 || y < 0 || x >= CELL || y >= CELL) return;
		const i = (y * CELL + x) * 4;
		buf[i] = r;
		buf[i + 1] = g;
		buf[i + 2] = b;
		buf[i + 3] = a;
	};
	// mirrored blob: filled ellipse, drawn both sides of the centre column
	const disc = (cx, cy, rx, ry, color) => {
		for (let y = -ry; y <= ry; y++) {
			for (let x = -rx; x <= rx; x++) {
				if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1)
					set(cx + x, cy + y, color);
			}
		}
	};
	const limb = (x0, y0, x1, y1, color, wgt = 2) => {
		const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
		for (let s = 0; s <= steps; s++) {
			const x = x0 + ((x1 - x0) * s) / steps;
			const y = y0 + ((y1 - y0) * s) / steps;
			disc(x, y, wgt, wgt, color);
		}
	};

	if (kind === "proc-dot") {
		// tiny hot pixel dot for tracers/muzzle
		disc(CELL / 2, CELL / 2, 5, 5, [255, 240, 200]);
		disc(CELL / 2, CELL / 2, 3, 3, [255, 255, 255]);
		return buf;
	}
	if (kind === "proc-crystal") {
		// a bright faceted gem (powerup pickup)
		const c = [120, 220, 255];
		const d = [40, 120, 200];
		const cx = CELL / 2;
		const cy = CELL / 2;
		for (let y = -18; y <= 18; y++) {
			const w = 14 - Math.abs(y) * 0.7;
			for (let x = -w; x <= w; x++) set(cx + x, cy + y, x < 0 ? c : d);
		}
		for (let y = -18; y <= 18; y += 1) set(cx, cy + y, [255, 255, 255]);
		return buf;
	}

	const pal = PALETTE[family] ?? PALETTE.husk;
	const cx = CELL / 2;
	const cy = CELL / 2;
	const p = pose === 0 ? 1 : -1; // stride direction flips per pose
	const jig = () => (rand() - 0.5) * 2;

	switch (family) {
		case "husk": {
			// bloated body + radial spikes + dark maw
			disc(cx, cy, 15, 17, pal.dark);
			disc(cx, cy, 12, 14, pal.base);
			for (let a = 0; a < 8; a++) {
				const ang = (a / 8) * Math.PI * 2;
				const len = 20 + (a % 2 === 0 ? p * 3 : -p * 3);
				limb(
					cx + Math.cos(ang) * 10,
					cy + Math.sin(ang) * 12,
					cx + Math.cos(ang) * len,
					cy + Math.sin(ang) * len,
					pal.dark,
					2,
				);
			}
			disc(cx, cy - 2, 5, 4, [20, 8, 10]);
			set(cx - 4, cy - 4, pal.hi);
			set(cx + 4, cy - 4, pal.hi);
			break;
		}
		case "darter": {
			// arrowhead abdomen pointing up + swept legs
			for (let y = -20; y <= 16; y++) {
				const w = y < 0 ? 10 + y * 0.5 : 10 - y * 0.4;
				for (let x = -w; x <= w; x++)
					set(cx + x, cy + y, x < 0 ? pal.base : pal.dark);
			}
			disc(cx, cy - 16, 4, 6, pal.hi); // sharp head
			for (const sx of [-1, 1]) {
				limb(cx + sx * 6, cy - 2, cx + sx * 22, cy - 10 + p * 6, pal.dark, 1);
				limb(cx + sx * 6, cy + 4, cx + sx * 22, cy + 8 - p * 6, pal.dark, 1);
			}
			break;
		}
		case "wraith": {
			// halo ring + floating core + wisps
			for (let a = 0; a < 40; a++) {
				const ang = (a / 40) * Math.PI * 2;
				set(cx + Math.cos(ang) * 18, cy + Math.sin(ang) * 18, pal.base);
				set(cx + Math.cos(ang) * 17, cy + Math.sin(ang) * 17, pal.base);
			}
			disc(cx, cy, 8, 8, pal.dark);
			disc(cx, cy, 5, 5, pal.hi);
			for (let i = 0; i < 5; i++)
				limb(
					cx - 12 + i * 6,
					cy + 14,
					cx - 12 + i * 6 + p * 3,
					cy + 22,
					pal.base,
					1,
				);
			break;
		}
		case "charger": {
			// wide armored carapace + horns up + short legs
			disc(cx, cy + 2, 16, 13, pal.dark);
			disc(cx, cy + 2, 13, 10, pal.base);
			for (let x = -10; x <= 10; x += 1) set(cx + x, cy, pal.dark); // plate seam
			for (const sx of [-1, 1]) {
				limb(cx + sx * 4, cy - 10, cx + sx * 9, cy - 22, pal.hi, 2); // horn
				limb(cx + sx * 12, cy - 2, cx + sx * 20, cy - 8 + p * 5, pal.dark, 2);
				limb(cx + sx * 12, cy + 6, cx + sx * 20, cy + 10 - p * 5, pal.dark, 2);
			}
			break;
		}
		case "weaver": {
			// twin heads + many legs
			for (const sx of [-1, 1]) {
				disc(cx + sx * 7, cy - 2, 8, 9, pal.dark);
				disc(cx + sx * 7, cy - 2, 6, 7, pal.base);
				set(cx + sx * 7 - 2, cy - 4, pal.hi);
				set(cx + sx * 7 + 2, cy - 4, pal.hi);
				for (let l = 0; l < 3; l++) {
					const ly = cy - 4 + l * 6;
					limb(
						cx + sx * 10,
						ly,
						cx + sx * 24,
						ly - 6 + p * 4 * (l - 1),
						pal.dark,
						1,
					);
				}
			}
			disc(cx, cy, 4, 4, pal.dark);
			break;
		}
		case "brood": {
			// bloated round sac + egg clusters + tiny legs
			disc(cx, cy, 17, 17, pal.dark);
			disc(cx, cy, 14, 14, pal.base);
			for (let i = 0; i < 6; i++) {
				const ang = rand() * Math.PI * 2;
				const d = rand() * 8;
				disc(cx + Math.cos(ang) * d, cy + Math.sin(ang) * d, 3, 3, pal.hi);
			}
			for (let a = 0; a < 8; a++) {
				const ang = (a / 8) * Math.PI * 2;
				limb(
					cx + Math.cos(ang) * 15,
					cy + Math.sin(ang) * 15,
					cx + Math.cos(ang) * 22,
					cy + Math.sin(ang) * 22 + p,
					pal.dark,
					1,
				);
			}
			break;
		}
		case "boss": {
			// big spiked overlord + crown + many eyes
			disc(cx, cy, 22, 22, pal.dark);
			disc(cx, cy, 18, 18, pal.base);
			for (let a = 0; a < 12; a++) {
				const ang = (a / 12) * Math.PI * 2;
				const len = 30 + (a % 2 === 0 ? p * 3 : -p * 3);
				limb(
					cx + Math.cos(ang) * 18,
					cy + Math.sin(ang) * 18,
					cx + Math.cos(ang) * len,
					cy + Math.sin(ang) * len,
					pal.dark,
					2,
				);
			}
			for (let i = 0; i < 5; i++) {
				const ex = cx - 8 + i * 4;
				set(ex, cy - 4, pal.hi);
				set(ex, cy - 4 + 1, [30, 20, 5]);
			}
			disc(cx, cy + 4, 6, 4, [30, 20, 5]);
			break;
		}
		case "hero": {
			// top-down marine: round torso, shoulders, rifle pointing up
			disc(cx, cy + 2, 12, 12, pal.dark);
			disc(cx, cy + 2, 9, 9, pal.base);
			for (const sx of [-1, 1]) disc(cx + sx * 11, cy + 2, 5, 6, pal.dark); // shoulders
			disc(cx, cy - 2, 6, 6, pal.hi); // helmet dome
			// rifle up the centre; recoil pose kicks it back + muzzle spark
			const recoil = pose === 1 ? 4 : 0;
			for (let y = 0; y <= 20; y++) set(cx, cy - 6 - y + recoil, [40, 40, 48]);
			for (let y = 0; y <= 20; y++)
				set(cx + 1, cy - 6 - y + recoil, [60, 60, 70]);
			if (pose === 1) disc(cx, cy - 26 + recoil, 4, 5, [255, 230, 150]);
			break;
		}
		default:
			disc(cx, cy, 14, 14, pal.base);
	}
	void jig;
	return buf;
}

// ---------------------------------------------------------------------------
// cache helpers — one PNG per accepted cell under .sprites-cache/
// ---------------------------------------------------------------------------
function cachePath(key) {
	return join(CACHE_DIR, `${key}.png`);
}
function saveCell(key, rgba, provenance) {
	mkdirSync(CACHE_DIR, { recursive: true });
	writeFileSync(cachePath(key), encodePng(CELL, CELL, rgba));
	const meta = provenanceLoad();
	meta[key] = provenance;
	writeFileSync(
		join(CACHE_DIR, "provenance.json"),
		`${JSON.stringify(meta, null, "\t")}\n`,
	);
}
function provenanceLoad() {
	const p = join(CACHE_DIR, "provenance.json");
	return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {};
}
// decode a cached CELLxCELL png back to RGBA (our own encoder output, filter 0)
function loadCellRgba(key) {
	// re-decode via the browser is overkill for our own files; instead re-paint
	// is impossible, so keep the raw RGBA alongside as .bin
	const bin = join(CACHE_DIR, `${key}.bin`);
	if (existsSync(bin)) return new Uint8Array(readFileSync(bin));
	return null;
}
function saveCellBin(key, rgba) {
	mkdirSync(CACHE_DIR, { recursive: true });
	writeFileSync(join(CACHE_DIR, `${key}.bin`), Buffer.from(rgba));
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
	mkdirSync(OUT_DIR, { recursive: true });
	mkdirSync(CACHE_DIR, { recursive: true });
	const cells = cellList();
	const onlySet = new Set(ONLY.split(",").filter(Boolean));
	const wants = (cell) =>
		onlySet.size === 0 || onlySet.has(cell.key) || onlySet.has(cell.family);

	let page;
	let browser;
	if (!PACK_ONLY) {
		browser = await chromium.launch();
		page = await browser.newPage();
	}

	for (const cell of cells) {
		const cachedBin = loadCellRgba(cell.key);
		const forceProc = PROC.has(cell.family) || PROC.has(cell.key);
		if (PACK_ONLY || (!wants(cell) && cachedBin)) {
			if (cachedBin) {
				console.log(`· ${cell.key.padEnd(16)} cached`);
				continue;
			}
		}
		let rgba = null;
		let provenance = "procedural";

		if (
			!PACK_ONLY &&
			cell.kind !== "proc-dot" &&
			cell.kind !== "proc-crystal" &&
			!forceProc &&
			KEY
		) {
			for (let attempt = 1; attempt <= REROLLS && !rgba; attempt++) {
				process.stdout.write(
					`  ${cell.key} AI attempt ${attempt}/${REROLLS}… `,
				);
				// eslint-disable-next-line no-await-in-loop
				const dataUrl = await generateImage(cell.prompt);
				if (!dataUrl) {
					console.log("no image");
					continue;
				}
				// eslint-disable-next-line no-await-in-loop
				const processed = await processInBrowser(page, dataUrl);
				if (processed) {
					rgba = processed;
					provenance = "ai";
					console.log("ok");
				} else {
					console.log("unusable (key/crop failed)");
				}
			}
		}
		if (!rgba) {
			rgba = painter(cell.family, cell.pose ?? 0, cell.kind ?? "creature");
			provenance = cell.kind?.startsWith("proc")
				? "procedural"
				: "procedural-fallback";
		}
		rgba = quantize(rgba, MAX_COLORS);
		saveCellBin(cell.key, rgba);
		saveCell(cell.key, rgba, provenance);
		console.log(`✓ ${cell.key.padEnd(16)} ${provenance}`);
	}
	if (browser) await browser.close();

	// ---- pack the atlas: uniform CELL grid, row-major, deterministic order ----
	const provenance = provenanceLoad();
	const cols = 8;
	const rows = Math.ceil(cells.length / cols);
	const atlasW = cols * CELL;
	const atlasH = rows * CELL;
	const atlas = new Uint8Array(atlasW * atlasH * 4);
	const manifestCells = {};
	const familyProv = {};
	cells.forEach((cell, idx) => {
		const col = idx % cols;
		const row = (idx / cols) | 0;
		let rgba = loadCellRgba(cell.key);
		if (!rgba)
			rgba = painter(cell.family, cell.pose ?? 0, cell.kind ?? "creature");
		for (let y = 0; y < CELL; y++) {
			for (let x = 0; x < CELL; x++) {
				const si = (y * CELL + x) * 4;
				const dx = col * CELL + x;
				const dy = row * CELL + y;
				const di = (dy * atlasW + dx) * 4;
				atlas[di] = rgba[si];
				atlas[di + 1] = rgba[si + 1];
				atlas[di + 2] = rgba[si + 2];
				atlas[di + 3] = rgba[si + 3];
			}
		}
		manifestCells[cell.key] = idx;
		if (cell.family !== "dot" && cell.family !== "crystal")
			familyProv[cell.family] =
				provenance[cell.key] ?? familyProv[cell.family] ?? "procedural";
	});

	const png = encodePng(atlasW, atlasH, atlas);
	writeFileSync(join(OUT_DIR, "sprites.png"), png);
	const manifest = {
		atlas: "sprites.png",
		cell: CELL,
		cols,
		rows,
		atlasWidth: atlasW,
		atlasHeight: atlasH,
		cells: manifestCells,
		provenance: familyProv,
	};
	writeFileSync(
		join(OUT_DIR, "sprites.json"),
		`${JSON.stringify(manifest, null, "\t")}\n`,
	);
	const sha = createHash("sha256").update(png).digest("hex");
	console.log(
		`\nsprites.png  ${atlasW}x${atlasH}  ${png.length} bytes  ${sha}`,
	);
	console.log("provenance:", JSON.stringify(familyProv));
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
