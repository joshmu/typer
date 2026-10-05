import { getArchetype, isBoss } from "./content/enemies";
import { COMBO_DECAY_TICKS, comboFraction, comboMultiplier } from "./sim/combo";
import { PERK_DEFS, type PerkId, type Rarity } from "./sim/perks";
import type { GameState } from "./sim/state";

export type HudView = {
	combo: {
		count: number;
		multiplier: number;
		fraction: number;
		hot: boolean;
	} | null;
	/** the first live boss; x/y let the shell tell whether it is on screen */
	boss: {
		name: string;
		hp: number;
		maxHp: number;
		x: number;
		y: number;
	} | null;
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
					x: boss.pos.x,
					y: boss.pos.y,
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

/** What the HUD should animate between two consecutive states. */
export type HudMoments = {
	/** The streak grew this frame. */
	comboUp: boolean;
	/** The streak crossed into a higher multiplier. */
	tierUp: boolean;
	/** The streak broke: what it was and how much of its window was left. */
	comboBroke: { count: number; fraction: number } | null;
	/** Index of the heart lost this frame (the new hp), if any. */
	heartLost: number | null;
};

type MomentState = Pick<GameState, "combo" | "playerHp" | "comboTicksLeft"> & {
	perks?: GameState["perks"];
};

/** The HUD moments between `prev` and `next`. Pure: no framework or DOM. */
export function hudMoments(
	prev: MomentState | null,
	next: MomentState,
): HudMoments {
	if (!prev) {
		return { comboUp: false, tierUp: false, comboBroke: null, heartLost: null };
	}
	// the decay window, as comboWindow reads it
	const window = prev.perks?.includes("adrenaline")
		? Math.floor(COMBO_DECAY_TICKS * 1.5)
		: COMBO_DECAY_TICKS;
	return {
		comboUp: next.combo > prev.combo,
		tierUp: comboMultiplier(next.combo) > comboMultiplier(prev.combo),
		comboBroke:
			prev.combo > 0 && next.combo === 0
				? {
						count: prev.combo,
						fraction: Math.min(1, prev.comboTicksLeft / window),
					}
				: null,
		heartLost: next.playerHp < prev.playerHp ? next.playerHp : null,
	};
}
