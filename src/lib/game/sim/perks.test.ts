import { describe, expect, it } from "vitest";
import {
	ALL_PERK_IDS,
	comboDecayTicks,
	cryoDurationMult,
	drawPerkOffer,
	isOverclockPrimed,
	killScoreWithPerks,
	knockbackMult,
	OVERCLOCK_STREAK,
	PERK_DEFS,
	type PerkId,
	powerupMilestoneDivisor,
	RARITY_WEIGHT,
	scoreWithPerks,
} from "./perks";
import { killScore } from "./score";
import { createInitialState, type GameState } from "./state";

function withPerks(perks: PerkId[], over: Partial<GameState> = {}): GameState {
	return { ...createInitialState(1), perks, ...over };
}

describe("perk definitions", () => {
	it("defines every id exactly once with matching key/id", () => {
		expect(ALL_PERK_IDS.length).toBe(14);
		expect(new Set(ALL_PERK_IDS).size).toBe(14);
		for (const id of ALL_PERK_IDS) {
			expect(PERK_DEFS[id].id).toBe(id);
			expect(PERK_DEFS[id].name.length).toBeGreaterThan(0);
			expect(PERK_DEFS[id].desc.length).toBeGreaterThan(0);
		}
	});

	it("marks only plating and greed repeatable", () => {
		const repeatable = ALL_PERK_IDS.filter((id) => PERK_DEFS[id].repeatable);
		expect(new Set(repeatable)).toEqual(new Set(["plating", "greed"]));
	});

	it("has the round-7 rarity split (4 epic, 5 rare, 5 common)", () => {
		const byRarity = { epic: 0, rare: 0, common: 0 };
		for (const id of ALL_PERK_IDS) byRarity[PERK_DEFS[id].rarity] += 1;
		expect(byRarity).toEqual({ epic: 4, rare: 5, common: 5 });
	});

	it("weights common 6 / rare 3 / epic 1", () => {
		expect(RARITY_WEIGHT).toEqual({ common: 6, rare: 3, epic: 1 });
	});
});

describe("drawPerkOffer", () => {
	it("draws 3 distinct ids and threads the rng", () => {
		const s = withPerks([]);
		const before = s.rngState;
		drawPerkOffer(s);
		expect(s.perkOffer).not.toBeNull();
		expect(s.perkOffer?.length).toBe(3);
		expect(new Set(s.perkOffer).size).toBe(3);
		expect(s.rngState).not.toBe(before);
	});

	it("is deterministic for a given rng state", () => {
		const a = withPerks([]);
		const b = withPerks([]);
		drawPerkOffer(a);
		drawPerkOffer(b);
		expect(a.perkOffer).toEqual(b.perkOffer);
	});

	it("excludes owned non-repeatable perks", () => {
		// own every non-repeatable perk → only plating/greed remain eligible, so the
		// offer must be padded from those two (they always stay eligible)
		const owned = ALL_PERK_IDS.filter((id) => !PERK_DEFS[id].repeatable);
		const s = withPerks(owned);
		drawPerkOffer(s);
		for (const id of s.perkOffer ?? []) {
			expect(["plating", "greed"]).toContain(id);
		}
	});

	it("keeps plating and greed eligible even when already owned", () => {
		const s = withPerks(["plating", "greed"]);
		let sawPlating = false;
		let sawGreed = false;
		let cur = s.rngState;
		for (let i = 0; i < 200; i++) {
			const draw = withPerks(["plating", "greed"], { rngState: cur });
			drawPerkOffer(draw);
			cur = draw.rngState;
			for (const id of draw.perkOffer ?? []) {
				if (id === "plating") sawPlating = true;
				if (id === "greed") sawGreed = true;
			}
		}
		expect(sawPlating).toBe(true);
		expect(sawGreed).toBe(true);
	});

	it("makes epics rarer than commons over many draws", () => {
		let epics = 0;
		let commons = 0;
		let cur = createInitialState(1).rngState;
		for (let i = 0; i < 2000; i++) {
			const s = withPerks([], { rngState: cur });
			drawPerkOffer(s);
			cur = s.rngState;
			for (const id of s.perkOffer ?? []) {
				if (PERK_DEFS[id].rarity === "epic") epics += 1;
				if (PERK_DEFS[id].rarity === "common") commons += 1;
			}
		}
		expect(epics).toBeGreaterThan(0);
		expect(commons).toBeGreaterThan(epics * 2);
	});
});

describe("score perks", () => {
	it("scoreWithPerks is identity without greed", () => {
		expect(scoreWithPerks(withPerks([]), 100)).toBe(100);
	});

	it("greed adds 10% per stack, floored", () => {
		expect(scoreWithPerks(withPerks(["greed"]), 100)).toBe(110);
		expect(scoreWithPerks(withPerks(["greed", "greed"]), 100)).toBe(120);
		expect(scoreWithPerks(withPerks(["greed"]), 15)).toBe(16); // floor(16.5)
	});

	it("killScoreWithPerks matches base killScore without perks", () => {
		const s = withPerks([]);
		expect(killScoreWithPerks(s, 4, 1)).toBe(killScore(4, 1));
	});

	it("sharpshooter multiplies kill score by 1.5, floored", () => {
		const base = killScore(5, 3);
		expect(killScoreWithPerks(withPerks(["sharpshooter"]), 5, 3)).toBe(
			Math.floor(base * 1.5),
		);
	});

	it("stacks sharpshooter then greed on kill score", () => {
		const base = killScore(5, 3);
		const expected = Math.floor(Math.floor(base * 1.5) * 1.1);
		expect(killScoreWithPerks(withPerks(["sharpshooter", "greed"]), 5, 3)).toBe(
			expected,
		);
	});
});

describe("stat perks", () => {
	it("heavy-rounds doubles regular knockback and lifts boss recoil 0.4→0.6", () => {
		expect(knockbackMult(withPerks([]), false)).toBe(1);
		expect(knockbackMult(withPerks([]), true)).toBe(0.4);
		expect(knockbackMult(withPerks(["heavy-rounds"]), false)).toBe(2);
		expect(knockbackMult(withPerks(["heavy-rounds"]), true)).toBe(0.6);
	});

	it("cryo-mastery scales powerup durations by 1.5", () => {
		expect(cryoDurationMult(withPerks([]))).toBe(1);
		expect(cryoDurationMult(withPerks(["cryo-mastery"]))).toBe(1.5);
	});

	it("adrenaline widens the combo decay window by 1.5", () => {
		const base = comboDecayTicks(withPerks([]));
		expect(comboDecayTicks(withPerks(["adrenaline"]))).toBe(
			Math.floor(base * 1.5),
		);
	});

	it("scavenger tightens the powerup milestone divisor 12→9", () => {
		expect(powerupMilestoneDivisor(withPerks([]))).toBe(12);
		expect(powerupMilestoneDivisor(withPerks(["scavenger"]))).toBe(9);
	});

	it("overclock primes only when owned and the streak is reached", () => {
		expect(
			isOverclockPrimed(withPerks([], { overclockStreak: OVERCLOCK_STREAK })),
		).toBe(false);
		expect(
			isOverclockPrimed(
				withPerks(["overclock"], { overclockStreak: OVERCLOCK_STREAK - 1 }),
			),
		).toBe(false);
		expect(
			isOverclockPrimed(
				withPerks(["overclock"], { overclockStreak: OVERCLOCK_STREAK }),
			),
		).toBe(true);
	});
});
