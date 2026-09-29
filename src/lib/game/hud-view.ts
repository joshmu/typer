import { getArchetype, isBoss } from "./content/enemies";
import { comboFraction, comboMultiplier } from "./sim/combo";
import { PERK_DEFS } from "./sim/perks";
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
	perkChips: string[];
};

const HOT_MULTIPLIER = 2;
const PERK_CHIP_CHARS = 8;

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
		perkChips: s.perks.map((id) =>
			PERK_DEFS[id].name.slice(0, PERK_CHIP_CHARS),
		),
	};
}
