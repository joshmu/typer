import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The simulation must produce bit-identical results across JS engines so that
 * seeded replays and golden fixtures stay valid everywhere. Per the ES spec
 * Math.sqrt is correctly rounded (deterministic), but Math.cos/sin/tan/hypot
 * are implementation-approximated and Math.random/Date.now are non-pure. This
 * static scan guards the sim sources against ever reintroducing them.
 *
 * Only the SIM SOURCE must stay pure — this test file itself may use node APIs.
 */
const SIM_DIR = join(process.cwd(), "src", "lib", "game", "sim");
const BANNED = /Math\.(hypot|cos|sin|tan|random)|Date\.now/;
const SOURCES = ["step.ts", "rng.ts", "state.ts", "replay.ts"];

describe("sim determinism", () => {
	for (const file of SOURCES) {
		it(`${file} uses only cross-engine-deterministic math`, () => {
			const src = readFileSync(join(SIM_DIR, file), "utf8");
			expect(src).not.toMatch(BANNED);
		});
	}
});
