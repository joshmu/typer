/**
 * Curated, MANUALLY-run AI asset generator for Horde environment textures.
 *
 *   OPENROUTER_API_KEY=... node scripts/gen-ai-assets.mjs [terrain|nebula|all]
 *
 * Calls OpenRouter's image-capable Gemini model and writes the returned PNGs to
 * public/game/. This is a provenance script, NOT a build step — CI never calls
 * the network. The committed PNGs under public/game/ are the artifacts of
 * record; re-run + eyeball the output, keep or re-roll, then commit the PNG.
 * NEVER commit the API key.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KEY = process.env.OPENROUTER_API_KEY;
if (!KEY) {
	console.error("OPENROUTER_API_KEY not set");
	process.exit(1);
}

const MODEL = process.env.AI_IMAGE_MODEL || "google/gemini-3.1-flash-image";
const OUT_DIR = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"public",
	"game",
);

const ASSETS = {
	terrain: {
		file: "terrain.png",
		prompt:
			"Seamless perfectly tileable 16-bit PIXEL ART top-down arena floor tile. " +
			"Scorched dark dirt and battered metal tech-plate flooring, chunky readable " +
			"pixels, hard-edged, dark moody palette (charcoal, deep brown, muted teal " +
			"accents), subtle rivets and cracks. Even flat lighting, no vignette, no seams, " +
			"no text, no characters, no border. Retro game texture, 256x256, tiles cleanly.",
	},
	nebula: {
		file: "nebula.png",
		prompt:
			"A dark deep-space nebula starfield backdrop. Mostly black with sparse small " +
			"stars and soft clouds of indigo, violet and faint magenta gas. Very dark and " +
			"unobtrusive, no planets, no text, no characters, wide panoramic 2048x1024.",
	},
};

async function generate(name, spec) {
	console.log(`\n=== ${name} (${MODEL}) ===`);
	const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${KEY}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model: MODEL,
			modalities: ["image", "text"],
			messages: [{ role: "user", content: spec.prompt }],
		}),
	});
	if (!res.ok) {
		console.error(`HTTP ${res.status}: ${await res.text()}`);
		return false;
	}
	const json = await res.json();
	const msg = json.choices?.[0]?.message;
	// image can arrive as message.images[].image_url.url (data URL) or inline in content
	let dataUrl;
	if (Array.isArray(msg?.images) && msg.images[0]) {
		dataUrl = msg.images[0].image_url?.url ?? msg.images[0].url;
	}
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
	if (!dataUrl) {
		console.error(
			"No image in response. Shape:",
			JSON.stringify(json).slice(0, 600),
		);
		return false;
	}
	const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
	const bytes = Buffer.from(b64, "base64");
	const path = join(OUT_DIR, spec.file);
	writeFileSync(path, bytes);
	console.log(`wrote ${spec.file} (${bytes.length} bytes)`);
	return true;
}

const which = process.argv[2] || "all";
const names = which === "all" ? Object.keys(ASSETS) : [which];
let ok = true;
for (const n of names) {
	if (!ASSETS[n]) {
		console.error(`unknown asset: ${n}`);
		ok = false;
		continue;
	}
	// eslint-disable-next-line no-await-in-loop
	ok = (await generate(n, ASSETS[n])) && ok;
}
process.exit(ok ? 0 : 1);
