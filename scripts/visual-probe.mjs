/**
 * Visual probe for Horde mode. Drives a real browser at the running dev server
 * and captures gameplay frames so a human (or agent) can READ the composition —
 * the playtest failure happened because nobody looked. Not part of CI.
 *
 * Usage (dev server must be up on :3000):
 *   node scripts/visual-probe.mjs [--out .probe] [--seed 42] [--keys]
 *
 * Captures into --out (default .probe/, gitignored):
 *   probe-start.png  real (non-testMode) session — the start overlay
 *   probe-play.png   testMode: stepped past the opening intermission (enemies on field)
 *   probe-late.png   testMode: stepped deeper (denser field, higher wave)
 *   probe-type.png   testMode: mid-word on the locked target (shots in flight) — with --keys
 *
 * Prints a JSON report (console errors + failed requests) to stdout.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

function arg(name, fallback) {
	const i = process.argv.indexOf(`--${name}`);
	if (i === -1) return fallback;
	const next = process.argv[i + 1];
	return next && !next.startsWith("--") ? next : true;
}

const OUT = String(arg("out", ".probe"));
const SEED = String(arg("seed", "42"));
const DO_KEYS = Boolean(arg("keys", false));
const BASE = "http://localhost:3000";

mkdirSync(OUT, { recursive: true });

const consoleErrors = [];
const failedRequests = [];

async function attach(page) {
	page.on("console", (m) => {
		if (m.type() === "error") consoleErrors.push(m.text());
	});
	page.on("requestfailed", (r) => {
		failedRequests.push(`${r.url()} — ${r.failure()?.errorText ?? "?"}`);
	});
	page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
}

const browser = await chromium.launch();
const context = await browser.newContext({
	viewport: { width: 1440, height: 900 },
	deviceScaleFactor: 1,
});
const page = await context.newPage();
await attach(page);

// 1) real session start overlay
await page.goto(`${BASE}/game?seed=${SEED}`);
await page.getByTestId("game-shell").waitFor();
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/probe-start.png` });

// 2) testMode: deterministic stepped frames
await page.goto(`${BASE}/game?seed=${SEED}&testMode=1`);
await page.waitForFunction(() => window.__game !== undefined);
await page.waitForFunction(() => window.__game?.renderReady() === true);

// past opening intermission + a few spawns
await page.evaluate(() => window.__game?.stepTicks(260));
await page.waitForFunction(() => window.__game?.renderReady() === true);
await page.evaluate(() => window.__game?.stepTicks(0));
await page.waitForTimeout(150);
await page.screenshot({ path: `${OUT}/probe-play.png` });

// deeper / denser
await page.evaluate(() => window.__game?.stepTicks(650));
await page.waitForFunction(() => window.__game?.renderReady() === true);
await page.evaluate(() => window.__game?.stepTicks(0));
await page.waitForTimeout(150);
await page.screenshot({ path: `${OUT}/probe-late.png` });

// 3) typing: lock a target and type half its word so shots are mid-flight
if (DO_KEYS) {
	// fresh run for a clean field
	await page.goto(`${BASE}/game?seed=${SEED}&testMode=1`);
	await page.waitForFunction(() => window.__game !== undefined);
	await page.evaluate(() => window.__game?.stepTicks(260));
	// type first half of the nearest enemy's word, one key per rendered frame,
	// pausing so tracer/muzzle effects are visibly animating on capture
	const word = await page.evaluate(() => {
		const s = window.__game?.getState();
		if (!s) return "";
		const alive = s.enemies.filter((e) => e.alive);
		if (alive.length === 0) return "";
		const e = alive[0];
		return e.words?.[e.wordIndex] ?? "";
	});
	// type up to (but not including) the final char, spacing the shots out
	const half = Math.max(2, Math.ceil(word.length / 2));
	for (let i = 0; i < half - 1; i++) {
		await page.evaluate((k) => window.__game?.sendKeys(k), word[i]);
		await page.evaluate(() => window.__game?.stepTicks(3));
	}
	await page.waitForFunction(() => window.__game?.renderReady() === true);
	// fire the final keystroke and capture the SAME frame it renders, so a fresh
	// tracer + muzzle flash is in the shot (testMode pushKey advances + renders)
	await page.evaluate((k) => window.__game?.sendKeys(k), word[half - 1]);
	await page.screenshot({ path: `${OUT}/probe-type.png` });
}

await browser.close();

console.log(
	JSON.stringify(
		{
			out: OUT,
			seed: SEED,
			consoleErrors,
			failedRequests,
			ok: consoleErrors.length === 0 && failedRequests.length === 0,
		},
		null,
		2,
	),
);
