import { dist } from "../sim/math";
import type { EnemyState } from "../sim/state";

/**
 * One word plate in an enemy's label, in typing order. `shield`: a completion
 * that a shield will absorb (the same word comes back); `armoured`: the
 * plated front blocks completions until the enemy is inside its expose
 * radius, so the repeat count is unknowable; `normal`: a completion lands.
 */
export type LabelRow = {
	word: string;
	kind: "normal" | "shield" | "armoured";
	/** letters already typed (only ever non-zero on the first row) */
	typed: number;
};

/**
 * What the player will actually type, plate by plate: the current word once
 * per remaining shield hit, then the word that lands, then the rest of the
 * chain. Pure; the label renderer draws exactly these rows.
 */
export function labelRows(e: EnemyState): LabelRow[] {
	const rows: LabelRow[] = [];
	const current = e.words[e.wordIndex];
	if (current === undefined) return rows;
	const shields =
		e.ability?.kind === "shield" ? Math.max(0, e.abilityState.shieldHits) : 0;
	for (let i = 0; i < shields; i++) {
		rows.push({ word: current, kind: "shield", typed: 0 });
	}
	const armoured =
		e.ability?.kind === "armored-front" &&
		dist(e.pos.x, e.pos.y) > e.ability.exposeRadius;
	rows.push({
		word: current,
		kind: armoured ? "armoured" : "normal",
		typed: 0,
	});
	for (let i = e.wordIndex + 1; i < e.words.length; i++) {
		rows.push({ word: e.words[i], kind: "normal", typed: 0 });
	}
	rows[0].typed = e.typedCount;
	return rows;
}
