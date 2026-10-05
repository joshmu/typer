import { describe, expect, it } from "vitest";
import { getArchetype } from "../content/enemies";
import { dealDamage } from "../sim/combat";
import { createEnemy } from "../sim/enemy-factory";
import { createInitialState, type EnemyState } from "../sim/state";
import { labelRows } from "./label-rows";

function enemy(archetypeId: string, words: string[], x = 30): EnemyState {
	return createEnemy(getArchetype(archetypeId), 1, { x, y: 0 }, 0, words);
}

const plain = (rows: ReturnType<typeof labelRows>) =>
	rows.map((r) => `${r.kind}:${r.word}:${r.typed}`);

describe("labelRows", () => {
	it("lists the remaining chain in typing order with progress on the first", () => {
		const e = enemy("husk-2", ["alpha", "beta", "gamma"]);
		e.wordIndex = 1;
		e.typedCount = 2;
		expect(plain(labelRows(e))).toEqual(["normal:beta:2", "normal:gamma:0"]);
	});

	it("repeats the current word once per remaining shield hit, as shield rows", () => {
		// Lancer: shield, 2 hits. "other" absorbs twice, then lands, then "matter"
		const e = enemy("weaver-2", ["other", "matter"]);
		expect(plain(labelRows(e))).toEqual([
			"shield:other:0",
			"shield:other:0",
			"normal:other:0",
			"normal:matter:0",
		]);
	});

	it("puts typed progress on the first shield row only", () => {
		const e = enemy("weaver-2", ["other", "matter"]);
		e.typedCount = 3;
		expect(plain(labelRows(e)).slice(0, 2)).toEqual([
			"shield:other:3",
			"shield:other:0",
		]);
	});

	it("pops one shield row per absorbed completion, matching the sim", () => {
		const s = createInitialState(1);
		const e = enemy("weaver-2", ["other", "matter"]);
		s.enemies = [e];
		const counts = [labelRows(e).length];
		for (let i = 0; i < 3; i++) {
			dealDamage(s, e);
			counts.push(e.alive ? labelRows(e).length : 0);
		}
		// 2 shields + other + matter → 3 → 2 (other landed) → … matches what is typed
		expect(counts).toEqual([4, 3, 2, 1]);
		expect(plain(labelRows(e))).toEqual(["normal:matter:0"]);
	});

	it("marks the current word armoured while an armored-front enemy is outside its expose radius", () => {
		const far = enemy("weaver-3", ["plate", "bolt"], 30);
		expect(plain(labelRows(far))).toEqual([
			"armoured:plate:0",
			"normal:bolt:0",
		]);
		const near = enemy("weaver-3", ["plate", "bolt"], 3);
		expect(plain(labelRows(near))).toEqual(["normal:plate:0", "normal:bolt:0"]);
	});

	it("leaves enemies without a blocking ability untouched", () => {
		const e = enemy("husk-1", ["solo"]);
		expect(plain(labelRows(e))).toEqual(["normal:solo:0"]);
	});
});
