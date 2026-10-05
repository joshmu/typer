import { describe, expect, it } from "vitest";
import { getArchetype } from "./content/enemies";
import { hudMoments, hudView, perkGlyph } from "./hud-view";
import { createEnemy } from "./sim/enemy-factory";
import { ALL_PERK_IDS } from "./sim/perks";
import { createInitialState, type GameState } from "./sim/state";
import { step } from "./sim/step";

function activeState(): GameState {
	const s = createInitialState(1);
	s.wavePhase = "active";
	s.wave = 3;
	s.spawnQueueRemaining = 0;
	return s;
}

describe("hudView combo", () => {
	it("measures the bar against the adrenaline window, not the base one", () => {
		let s = activeState();
		s.perks = ["adrenaline"];
		s.enemies = [
			createEnemy(getArchetype("husk-1"), 1, { x: 8, y: 0 }, 0, ["a"]),
			createEnemy(getArchetype("husk-1"), 2, { x: -8, y: 0 }, 0, ["zzzz"]),
		];
		s.nextEnemyId = 3;
		s = step(s, [{ type: "key", key: "a" }]);
		expect(s.comboTicksLeft).toBe(270);
		expect(hudView(s).combo?.fraction).toBe(270 / 270);
		s = step(s, []);
		expect(hudView(s).combo?.fraction).toBe(269 / 270);
	});

	it("is hidden with no live combo", () => {
		expect(hudView(activeState()).combo).toBeNull();
	});

	it("reports multiplier and heat from the streak", () => {
		const s = activeState();
		s.combo = 4;
		s.comboTicksLeft = 90;
		expect(hudView(s).combo).toEqual({
			count: 4,
			multiplier: 1,
			fraction: 0.5,
			hot: false,
		});
		s.combo = 5;
		expect(hudView(s).combo).toMatchObject({ multiplier: 2, hot: true });
	});
});

describe("hudView boss", () => {
	it("shows the first alive boss", () => {
		const s = activeState();
		const dead = createEnemy(getArchetype("boss-maw"), 1, { x: 8, y: 0 }, 0, [
			"a",
			"b",
			"c",
			"d",
		]);
		dead.alive = false;
		const boss = createEnemy(getArchetype("boss-iron"), 2, { x: 8, y: 0 }, 0, [
			"e",
			"f",
			"g",
			"h",
		]);
		boss.hp = 2;
		s.enemies = [
			createEnemy(getArchetype("husk-1"), 3, { x: 8, y: 0 }, 0, ["x"]),
			dead,
			boss,
		];
		expect(hudView(s).boss).toEqual({
			name: getArchetype("boss-iron").name,
			hp: 2,
			maxHp: boss.maxHp,
			x: 8,
			y: 0,
		});
	});

	it("is null with no boss alive", () => {
		const s = activeState();
		s.enemies = [
			createEnemy(getArchetype("husk-1"), 1, { x: 8, y: 0 }, 0, ["x"]),
		];
		expect(hudView(s).boss).toBeNull();
	});
});

describe("hudView wave", () => {
	it("labels an active wave, flagging a frenzy", () => {
		const s = activeState();
		expect(hudView(s).wave).toEqual({ label: "wave 3", frenzy: false });
		s.waveKind = "swarm";
		expect(hudView(s).wave).toEqual({
			label: "FRENZY · wave 3",
			frenzy: true,
		});
	});

	it("announces the next wave during intermission", () => {
		const s = activeState();
		s.wavePhase = "intermission";
		expect(hudView(s).wave).toBeNull();
		expect(hudView(s).incoming).toBe("WAVE 4 INCOMING");
	});

	it("announces nothing before the first wave", () => {
		const s = createInitialState(1);
		expect(hudView(s).incoming).toBeNull();
		expect(hudView(s).wave).toBeNull();
	});
});

describe("hudView perks", () => {
	it("shows one chip per perk with its full name, glyph and stack count", () => {
		const s = activeState();
		s.perks = ["plating", "adrenaline", "plating"];
		const chips = hudView(s).perkChips;
		expect(chips.map((c) => [c.id, c.name, c.count])).toEqual([
			["plating", "Plating", 2],
			["adrenaline", "Adrenaline", 1],
		]);
		for (const c of chips) expect(c.glyph.length).toBeGreaterThan(0);
	});

	it("never truncates long perk names", () => {
		const s = activeState();
		s.perks = ["chain-arc", "splash-rounds"];
		expect(hudView(s).perkChips.map((c) => c.name)).toEqual([
			"Chain Arc",
			"Splash Rounds",
		]);
	});

	it("carries the rarity so the chip can be accented", () => {
		const s = activeState();
		s.perks = ["chain-arc", "greed"];
		expect(hudView(s).perkChips.map((c) => c.rarity)).toEqual([
			"epic",
			"common",
		]);
	});
});

describe("perkGlyph", () => {
	it("gives every perk a distinct glyph", () => {
		const glyphs = ALL_PERK_IDS.map(perkGlyph);
		expect(new Set(glyphs).size).toBe(ALL_PERK_IDS.length);
	});
});

describe("hudMoments", () => {
	const at = (combo: number, hp = 3, comboTicksLeft = 100) => ({
		combo,
		playerHp: hp,
		comboTicksLeft,
	});

	it("reports nothing on the first state or when nothing changed", () => {
		expect(hudMoments(null, at(3))).toEqual({
			comboUp: false,
			tierUp: false,
			comboBroke: null,
			heartLost: null,
		});
		expect(hudMoments(at(3), at(3)).comboUp).toBe(false);
	});

	it("a kill bumps the combo; crossing a multiplier step is a tier-up", () => {
		expect(hudMoments(at(3), at(4))).toMatchObject({
			comboUp: true,
			tierUp: false,
		});
		expect(hudMoments(at(4), at(5))).toMatchObject({
			comboUp: true,
			tierUp: true,
		});
	});

	it("a broken combo reports what was lost: its count and remaining window", () => {
		expect(hudMoments(at(7, 3, 90), at(0, 3, 0)).comboBroke).toEqual({
			count: 7,
			fraction: 90 / 180,
		});
		expect(hudMoments(at(0), at(0)).comboBroke).toBeNull();
	});

	it("names the heart that was lost", () => {
		expect(hudMoments(at(0, 3), at(0, 2)).heartLost).toBe(2);
		expect(hudMoments(at(0, 2), at(0, 3)).heartLost).toBeNull();
	});
});

describe("hudView overdrive", () => {
	it("is on from the x3 multiplier and off below it", () => {
		const s = activeState();
		s.combo = 9;
		expect(hudView(s).overdrive).toBe(false);
		s.combo = 10;
		expect(hudView(s).overdrive).toBe(true);
		s.combo = 0;
		expect(hudView(s).overdrive).toBe(false);
	});
});
