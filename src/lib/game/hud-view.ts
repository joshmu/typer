import { getArchetype, isBoss } from "./content/enemies";
import { comboFraction, comboMultiplier } from "./sim/combo";
import { PERK_DEFS, type PerkId, type Rarity } from "./sim/perks";
import type { GameState } from "./sim/state";

export type HudView = {
	combo: {
		count: number;
		multiplier: number;
		fraction: number;
		hot: boolean;
	} | null;
	boss: { name: string; hp: number; maxHp: number } | null;
	wave: { label: string; frenzy: boolean } | null;
	incoming: string | null;
	perkChips: PerkChip[];
};

/** One owned perk in the HUD strip; repeat picks stack into `count`. */
export type PerkChip = {
	id: PerkId;
	name: string;
	glyph: string;
	rarity: Rarity;
	count: number;
};

// text-presentation glyphs (no emoji variants) that hint at each perk's effect
const PERK_GLYPHS: Record<PerkId, string> = {
	"splash-rounds": "\u273A", // ✺
	"piercing-bolt": "\u21A0", // ↠
	"chain-arc": "\u03DF", // ϟ
	"heavy-rounds": "\u25C9", // ◉
	"steady-hands": "\u25CE", // ◎
	sharpshooter: "\u2316", // ⌖
	overclock: "\u21AF", // ↯
	"gravity-well": "\u25CD", // ◍
	vampiric: "\u2726", // ✦
	plating: "\u25A3", // ▣
	"cryo-mastery": "\u2745", // ❅
	adrenaline: "\u00BB", // »
	scavenger: "\u25C7", // ◇
	greed: "\u25C8", // ◈
};

export function perkGlyph(id: PerkId): string {
	return PERK_GLYPHS[id];
}

function perkChips(perks: readonly PerkId[]): PerkChip[] {
	const chips: PerkChip[] = [];
	for (const id of perks) {
		const chip = chips.find((c) => c.id === id);
		if (chip) {
			chip.count += 1;
			continue;
		}
		const def = PERK_DEFS[id];
		chips.push({
			id,
			name: def.name,
			glyph: PERK_GLYPHS[id],
			rarity: def.rarity,
			count: 1,
		});
	}
	return chips;
}

const HOT_MULTIPLIER = 2;

/** What the Horde HUD shows for a state. Pure: no framework or DOM. */
export function hudView(s: GameState): HudView {
	const multiplier = comboMultiplier(s.combo);
	const boss = s.enemies.find((e) => e.alive && isBoss(e));
	return {
		combo:
			s.combo > 0
				? {
						count: s.combo,
						multiplier,
						fraction: comboFraction(s),
						hot: multiplier >= HOT_MULTIPLIER,
					}
				: null,
		boss: boss
			? {
					name: getArchetype(boss.archetypeId).name,
					hp: boss.hp,
					maxHp: boss.maxHp,
				}
			: null,
		wave:
			s.wavePhase === "active"
				? s.waveKind === "swarm"
					? { label: `FRENZY · wave ${s.wave}`, frenzy: true }
					: { label: `wave ${s.wave}`, frenzy: false }
				: null,
		incoming:
			s.wavePhase === "intermission" && s.wave > 0
				? `WAVE ${s.wave + 1} INCOMING`
				: null,
		perkChips: perkChips(s.perks),
	};
}
