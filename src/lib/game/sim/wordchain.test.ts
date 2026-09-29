import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getArchetype } from "../content/enemies";
import { createEnemy } from "./enemy-factory";
import type { InputLog } from "./replay";
import { createInitialState, currentWord, type GameState } from "./state";
import { type GameEvent, step } from "./step";
import {
	advanceWord,
	assignChain,
	growChain,
	reservedInitials,
	unwalkedWords,
} from "./wordchain";

function chain(len: number, count: number): string[] {
	return Array.from({ length: count }, () => "x".repeat(len));
}

function withEnemies(...words: string[][]): GameState {
	const s = createInitialState(42);
	const arch = getArchetype("husk-4");
	s.enemies = words.map((w, i) =>
		createEnemy(arch, i + 1, { x: 5 + i, y: 0 }, 0, w),
	);
	s.nextEnemyId = words.length + 1;
	return s;
}

describe("reservedInitials", () => {
	it("holds every alive enemy's current initial and every powerup initial", () => {
		const s = withEnemies(["apple", "zoo"], ["bear"], ["cat"]);
		s.enemies[0].wordIndex = 1;
		s.enemies[2].alive = false;
		s.powerups = [
			{
				id: 1,
				kind: "freeze",
				word: "nova",
				typedCount: 0,
				pos: { x: 0, y: 0 },
				expiresTick: 600,
			},
		];
		expect([...reservedInitials(s)].sort()).toEqual(["b", "n", "z"]);
	});

	it("leaves out the excepted enemy", () => {
		const s = withEnemies(["apple"], ["bear"]);
		expect([...reservedInitials(s, 1)]).toEqual(["b"]);
	});
});

describe("assignChain", () => {
	it("gives a regular one word per hp, all avoiding reserved initials", () => {
		const s = withEnemies(["apple"], ["bear"]);
		const arch = getArchetype("husk-4");
		const words = assignChain(s, arch, false);
		expect(words).toHaveLength(arch.hp);
		for (const w of words) expect(["a", "b"]).not.toContain(w[0]);
	});

	it("gives a frenzy small a single letter", () => {
		const s = withEnemies(["apple"]);
		const words = assignChain(s, getArchetype("husk-1"), true);
		expect(words).toHaveLength(1);
		expect(words[0]).toMatch(/^[b-z]$/);
	});

	it("gives a boss a whole sentence", () => {
		const s = createInitialState(7);
		const words = assignChain(s, getArchetype("boss-maw"), false);
		expect(words.length).toBeGreaterThan(getArchetype("boss-maw").hp);
	});

	it("threads the rng through state", () => {
		const s = createInitialState(7);
		const before = s.rngState;
		assignChain(s, getArchetype("husk-4"), false);
		expect(s.rngState).not.toBe(before);
	});
});

describe("advanceWord", () => {
	it("steps to the next pre-assigned word without growing the chain", () => {
		const s = withEnemies(["alpha", "bravo", "charlie"]);
		const e = s.enemies[0];
		e.typedCount = 3;
		advanceWord(s, e);
		expect(e.wordIndex).toBe(1);
		expect(e.typedCount).toBe(0);
		expect(e.words).toEqual(["alpha", "bravo", "charlie"]);
	});

	it("redraws a colliding next word into a fresh array", () => {
		const s = withEnemies(chain(9, 3), chain(9, 3));
		const e = s.enemies[0];
		const prior = e.words;
		advanceWord(s, e);
		expect(currentWord(e)[0]).not.toBe("x");
		expect(e.words).toHaveLength(3);
		expect(prior).toEqual(chain(9, 3));
	});
});

describe("growChain", () => {
	it("tops the chain up so the unwalked words match hp", () => {
		const s = withEnemies(["apple", "bear", "cat"], ["dog"]);
		const e = s.enemies[0];
		e.wordIndex = 2;
		e.hp = 3;
		const prior = e.words;
		growChain(s, e);
		expect(unwalkedWords(e)).toBe(3);
		expect(e.words.slice(0, 3)).toEqual(["apple", "bear", "cat"]);
		for (const w of e.words.slice(3)) expect(w[0]).not.toBe("d");
		expect(prior).toHaveLength(3);
	});

	it("leaves a chain that already covers hp untouched", () => {
		const s = withEnemies(["apple", "bear"]);
		const e = s.enemies[0];
		const before = s.rngState;
		growChain(s, e);
		expect(e.words).toEqual(["apple", "bear"]);
		expect(s.rngState).toBe(before);
	});
});

describe("chain invariant", () => {
	it("every alive enemy has exactly hp unwalked words on every tick of the deep run", async () => {
		const fixture = await import("./__fixtures__/replay-deep-run.json");
		const log = fixture.log as InputLog;
		let s = createInitialState(log.seed);
		for (let t = 1; t <= log.ticks; t++) {
			const events: GameEvent[] = log.events
				.filter((e) => e.tick === t)
				.map((e) =>
					"perk" in e
						? { type: "perk", index: e.perk as number }
						: { type: "key", key: e.key as string },
				);
			s = step(s, events);
			for (const e of s.enemies) {
				if (e.alive) expect(unwalkedWords(e)).toBe(e.hp);
			}
		}
	});
});

describe("module graph", () => {
	it("abilities does not import combat", () => {
		const src = readFileSync(
			join(process.cwd(), "src/lib/game/sim/abilities.ts"),
			"utf8",
		);
		expect(src).not.toMatch(/from "\.\/combat"/);
	});
});
