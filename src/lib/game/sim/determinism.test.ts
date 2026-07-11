import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The simulation must produce bit-identical results across JS engines so that
 * seeded replays and golden fixtures stay valid everywhere. Per the ES spec
 * Math.sqrt is correctly rounded (deterministic), but Math.cos/sin/tan/hypot
 * are implementation-approximated and Math.random/Date.now are non-pure. This
 * static scan guards every non-test sim + content source against ever
 * reintroducing them.
 *
 * Only the SIM/CONTENT SOURCE must stay pure — test files themselves may use
 * node APIs and the built-in trig (for accuracy comparisons).
 */
const GAME_DIR = join(process.cwd(), "src", "lib", "game");
const SCANNED_DIRS = [join(GAME_DIR, "sim"), join(GAME_DIR, "content")];
const BANNED = /Math\.(hypot|cos|sin|tan|random)|Date\.now/;

function collectSources(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === "__fixtures__") continue;
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...collectSources(full));
			continue;
		}
		if (!entry.name.endsWith(".ts")) continue;
		if (entry.name.endsWith(".test.ts")) continue;
		out.push(full);
	}
	return out;
}

const SOURCES = SCANNED_DIRS.flatMap(collectSources);

describe("sim determinism", () => {
	for (const file of SOURCES) {
		const rel = file.slice(GAME_DIR.length + 1);
		it(`${rel} uses only cross-engine-deterministic math`, () => {
			const src = readFileSync(file, "utf8");
			expect(src).not.toMatch(BANNED);
		});
	}
});
