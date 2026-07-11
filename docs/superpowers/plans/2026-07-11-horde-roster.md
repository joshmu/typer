# Horde Mode — Enemy Roster + Word Banding Implementation Plan (Plan 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the sim's placeholder content (interim `grunt`/`brute` archetypes, flat `top200` word picker) into full breadth: a 30+ enemy roster (24 regulars across 6 families × 4 tiers + 6 word-chain bosses), per-tier word bands sourced from the real `english-1k`/`english-5k` data, roster validation tests, and wave-banded spawner weighting.

**Architecture:** Pure data + pure functions only, extending Plan 2's shapes verbatim. `EnemyArchetype` (with `movement`/`ability`/`role`/`tier`), `MovementId`, `Ability`, `selectArchetypeId(wave, rngState)`, `spawnFromArchetype`, and `reassignWord` are already defined by Plan 2; this plan fills in the roster table, adds `pickWordForTier`, and swaps the interim picker/selector bodies. No new runtime dependencies. Determinism is preserved by re-recording Plan 2's golden fixtures after each behaviour-affecting change.

**Tech Stack:** TypeScript (strict), Vitest 4. Word data is `src/lib/core/text/data/english-1k.json` and `english-5k.json` — **both are plain JSON arrays of strings** (verified), statically importable because the repo `tsconfig.json` has `resolveJsonModule: true`.

## Global Constraints

- `src/lib/game/content/**` and `src/lib/game/sim/**` MUST stay pure: no Babylon, Solid, DOM, `Date.now`, or `Math.random`. Randomness flows through `rngState`; the tiered word pickers thread `rngState` exactly like the existing `pickWord`.
- Roster is **data, not code**: `ENEMIES` is a flat array of `EnemyArchetype`. Behaviour comes from the `movement` string and `ability` union defined in Plan 2 — no new archetype fields beyond what Plan 2 established (`id`, `name`, `hp`, `speed`, `size`, `tier`, `movement`, `ability`, `role`). Word band is derived from `tier` (no `wordBand` field).
- Every `ability`'s `minion` reference (`split`, `spawn`) MUST resolve to a real `id` in `ENEMIES`. A validation test enforces this.
- Per-tick sim cost stays O(enemies); the spawner's weighting work happens once per spawn (not per tick).
- Every commit keeps `pnpm typecheck && pnpm lint && pnpm test:run` green. Any task that changes word choice or spawn selection re-records **both** Plan 2 golden fixtures in that same task (procedure below).
- **Re-record golden fixtures procedure** (recorder shipped in Plan 2 Task 1/8): run `RECORD_FIXTURE=1 pnpm test:run -- src/lib/game/sim/replay.test.ts` (rewrites `replay-first-kill.json` and `replay-deep-run.json`), then `pnpm test:run -- src/lib/game/sim/replay.test.ts` → PASS. `git add` both regenerated JSON files with the task's commit.
- Repo style: tabs for indentation, double quotes, Biome formatting. Commit format `type(game): …`. Every commit message ends with:

  ```
  Claude-Session: https://claude.ai/code/session_01N1YqXkNqwh76TbQtmr9DRC
  ```
- TDD: write the failing test first, watch it fail, write minimal code, watch it pass.

**Prerequisite:** Plan 2 (`docs/superpowers/plans/2026-07-11-horde-sim-depth.md`) is fully merged. This plan assumes `pickWord(rngState, excludeInitials) → [word, next]`, `selectArchetypeId(wave, rngState) → [id, next]`, `spawnFromArchetype(s, archetypeId, pos)`, `reassignWord(s, e)`, the `Ability`/`MovementId`/`EnemyArchetype` types, and the golden-fixture recorder all exist as Plan 2 defined them.

---

### Task 1: Per-tier word bands

**Files:**
- Modify: `src/lib/game/content/words.ts`
- Modify: `src/lib/game/content/words.test.ts`
- Modify: `src/lib/game/sim/spawner.ts` (tiered picker in `spawnFromArchetype`)
- Modify: `src/lib/game/sim/combat.ts` (tiered picker in `reassignWord`)

**Interfaces:**
- Consumes: `english-1k.json`, `english-5k.json` (`@/lib/core/text/data/*` — `string[]`), `top200` (`@/lib/core/text/words`), `nextInt` (`../sim/rng`).
- Produces:

```ts
export type Tier = 1 | 2 | 3 | 4;
export function pickWordForTier(
	tier: Tier,
	rngState: number,
	excludeInitials: ReadonlySet<string>,
): [word: string, next: number];
export function pickWord(
	rngState: number,
	excludeInitials: ReadonlySet<string>,
): [word: string, next: number]; // tier-1 alias, signature unchanged
```

Band ranges (word length), each non-empty against the real data (1k has ≥73 words per length 3–6; 5k has ≥600 per length 6–8 and ≥550 per length 8–12):

| Tier | Source | Length | Feel |
|---|---|---|---|
| 1 | english-1k | 3–4 | short common |
| 2 | english-1k | 5–6 | medium common |
| 3 | english-5k | 6–8 | long |
| 4 | english-5k | 8–12 | long/rare (boss chains) |

- [ ] **Step 1: Rewrite the words test** (`words.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { createRngState } from "../sim/rng";
import { pickWord, pickWordForTier, type Tier } from "./words";

const RANGES: Record<Tier, [number, number]> = {
	1: [3, 4],
	2: [5, 6],
	3: [6, 8],
	4: [8, 12],
};

describe("pickWordForTier", () => {
	it("is deterministic per tier + seed", () => {
		for (const tier of [1, 2, 3, 4] as Tier[]) {
			const [w1] = pickWordForTier(tier, createRngState(5), new Set());
			const [w2] = pickWordForTier(tier, createRngState(5), new Set());
			expect(w1).toBe(w2);
		}
	});

	it("returns words inside each tier band", () => {
		for (const tier of [1, 2, 3, 4] as Tier[]) {
			let s = createRngState(tier * 7);
			const [lo, hi] = RANGES[tier];
			for (let i = 0; i < 40; i++) {
				const [w, n] = pickWordForTier(tier, s, new Set());
				expect(w.length).toBeGreaterThanOrEqual(lo);
				expect(w.length).toBeLessThanOrEqual(hi);
				s = n;
			}
		}
	});

	it("avoids excluded initials when possible", () => {
		let s = createRngState(1);
		for (let i = 0; i < 50; i++) {
			const [w, n] = pickWordForTier(3, s, new Set(["t", "a"]));
			expect(["t", "a"]).not.toContain(w[0]);
			s = n;
		}
	});
});

describe("pickWord (tier-1 alias)", () => {
	it("returns a short common word deterministically", () => {
		const [w1] = pickWord(createRngState(5), new Set());
		const [w2] = pickWord(createRngState(5), new Set());
		expect(w1).toBe(w2);
		expect(w1.length).toBeGreaterThanOrEqual(3);
		expect(w1.length).toBeLessThanOrEqual(4);
	});
});
```

- [ ] **Step 2: Run to fail** — `pnpm test:run -- src/lib/game/content/words.test.ts` → FAIL (`pickWordForTier` missing).

- [ ] **Step 3: Implement banded picker** (`words.ts`)

```ts
import english1k from "@/lib/core/text/data/english-1k.json";
import english5k from "@/lib/core/text/data/english-5k.json";
import { nextInt } from "../sim/rng";

export type Tier = 1 | 2 | 3 | 4;

const ONE_K = english1k as string[];
const FIVE_K = english5k as string[];

function band(source: string[], lo: number, hi: number): string[] {
	return source.filter((w) => w.length >= lo && w.length <= hi);
}

const BANDS: Record<Tier, string[]> = {
	1: band(ONE_K, 3, 4),
	2: band(ONE_K, 5, 6),
	3: band(FIVE_K, 6, 8),
	4: band(FIVE_K, 8, 12),
};

export function pickWordForTier(
	tier: Tier,
	rngState: number,
	excludeInitials: ReadonlySet<string>,
): [word: string, next: number] {
	const pool = BANDS[tier];
	const filtered = pool.filter((w) => !excludeInitials.has(w[0]));
	const usable = filtered.length > 0 ? filtered : pool;
	const [i, next] = nextInt(rngState, usable.length);
	return [usable[i], next];
}

export function pickWord(
	rngState: number,
	excludeInitials: ReadonlySet<string>,
): [word: string, next: number] {
	return pickWordForTier(1, rngState, excludeInitials);
}
```

The former `top200`-based `POOL` and its import are removed; the tier-1 band from `english-1k` supersedes it. (Leave `@/lib/core/text/words`'s own `top200` export untouched — it is still used elsewhere in the app.)

- [ ] **Step 4: Run to pass** — Step 1 command → PASS.

- [ ] **Step 5: Use the tiered picker in `spawnFromArchetype`** (`spawner.ts`)

Change the import in `spawner.ts` from `pickWord` to `pickWordForTier`:

```ts
import { pickWordForTier } from "../content/words";
```

In `spawnFromArchetype`, pick from the archetype's tier band:

```ts
export function spawnFromArchetype(
	s: GameState,
	archetypeId: string,
	pos: Vec2,
): void {
	const arch = getArchetype(archetypeId);
	const initials = new Set(
		s.enemies.filter((e) => e.alive).map((e) => e.word[0]),
	);
	const [word, next] = pickWordForTier(arch.tier, s.rngState, initials);
	s.rngState = next;
	const enemy = createEnemy(arch, s.nextEnemyId, pos, s.tick, word);
	s.nextEnemyId += 1;
	s.enemies = [...s.enemies, enemy];
}
```

- [ ] **Step 6: Use the tiered picker in `reassignWord`** (`combat.ts`)

Change the import in `combat.ts` from `pickWord` to `pickWordForTier`:

```ts
import { pickWordForTier } from "../content/words";
```

In `reassignWord`, reassign from the enemy's own tier band (so a boss's chain stays in the tier-4 band):

```ts
export function reassignWord(s: GameState, e: EnemyState): void {
	const initials = new Set(
		s.enemies.filter((x) => x.alive && x.id !== e.id).map((x) => x.word[0]),
	);
	const [word, next] = pickWordForTier(e.tier, s.rngState, initials);
	s.rngState = next;
	e.word = word;
	e.typedCount = 0;
}
```

- [ ] **Step 7: Run the game suite** — `pnpm test:run -- src/lib/game` → green except the two golden fixtures (word source changed). Re-record both (Global Constraints procedure), re-run replay → PASS.

- [ ] **Step 8: Verify checks** — `pnpm typecheck && pnpm lint` → clean.

- [ ] **Step 9: Commit**

```bash
git add src/lib/game/content/words.ts src/lib/game/content/words.test.ts \
  src/lib/game/sim/spawner.ts src/lib/game/sim/combat.ts \
  src/lib/game/sim/__fixtures__/replay-first-kill.json \
  src/lib/game/sim/__fixtures__/replay-deep-run.json
git commit
```

Commit message:

```
feat(game): add per-tier word bands from english-1k and english-5k data

Claude-Session: https://claude.ai/code/session_01N1YqXkNqwh76TbQtmr9DRC
```

---

### Task 2: Full 30+ enemy roster

**Files:**
- Modify: `src/lib/game/content/enemies.ts` (replace `ENEMIES`)
- Modify: `src/lib/game/content/enemies.test.ts` (roster validation)
- Modify: `src/lib/game/sim/combat.test.ts` (interim id references → roster ids)
- Modify: `src/lib/game/sim/powerups.test.ts` (interim id references → roster ids)

**Interfaces:**
- Consumes: `EnemyArchetype`, `MovementId`, `Ability` (all from `./enemies`, defined in Plan 2).
- Produces: `ENEMIES` with 30 entries (24 `role: "regular"` + 6 `role: "boss"`), all ids unique, every `movement` a valid `MovementId`, every ability `minion` resolving to a roster id, every tier 1–4 represented.

**Roster design.** Six families, each a movement identity; four tiers per family with escalating hp/size and decreasing speed; six bosses (tier 4, `role: "boss"`, hp 4–5 = word-chain length). All eight abilities appear at least once (`shield`, `armored-front`, `cloak`, `teleport`, `enrage-at-half`, `heal-aura`, `spawn`, `split`). `split`/`spawn` minions reference `"brood-1"` (Broodling), a real roster entry.

| id | name | hp | speed | size | tier | movement | ability |
|---|---|---|---|---|---|---|---|
| husk-1 | Huskling | 1 | 0.050 | 0.7 | 1 | chase | — |
| husk-2 | Husk | 1 | 0.044 | 0.9 | 2 | chase | — |
| husk-3 | Ravener | 2 | 0.034 | 1.2 | 3 | chase | enrage-at-half ×1.8 |
| husk-4 | Colossus Husk | 3 | 0.024 | 1.7 | 4 | chase | heal-aura r5 +1/180 |
| darter-1 | Nit | 1 | 0.058 | 0.6 | 1 | zigzag | — |
| darter-2 | Flitter | 1 | 0.050 | 0.8 | 2 | zigzag | cloak/45 |
| darter-3 | Shade Darter | 2 | 0.040 | 1.0 | 3 | zigzag | cloak/35 |
| darter-4 | Voidwing | 3 | 0.030 | 1.4 | 4 | zigzag | teleport/120 r4 |
| wraith-1 | Wisp | 1 | 0.052 | 0.6 | 1 | orbit-then-dive | — |
| wraith-2 | Haunt | 1 | 0.046 | 0.9 | 2 | orbit-then-dive | teleport/150 r3 |
| wraith-3 | Phantom | 2 | 0.036 | 1.1 | 3 | orbit-then-dive | cloak/40 |
| wraith-4 | Revenant | 3 | 0.028 | 1.5 | 4 | orbit-then-dive | teleport/100 r5 |
| charger-1 | Tick | 1 | 0.048 | 0.7 | 1 | dash-pause | — |
| charger-2 | Rammer | 2 | 0.042 | 1.0 | 2 | dash-pause | enrage-at-half ×1.6 |
| charger-3 | Gorehoof | 2 | 0.034 | 1.3 | 3 | dash-pause | enrage-at-half ×1.8 |
| charger-4 | Juggernaut | 4 | 0.024 | 1.8 | 4 | dash-pause | armored-front r5 |
| weaver-1 | Creeper | 1 | 0.050 | 0.7 | 1 | flank | shield 1 |
| weaver-2 | Lancer | 2 | 0.042 | 1.0 | 2 | flank | shield 2 |
| weaver-3 | Bulwark | 2 | 0.032 | 1.3 | 3 | flank | armored-front r4 |
| weaver-4 | Aegis | 3 | 0.026 | 1.6 | 4 | flank | armored-front r6 |
| brood-1 | Broodling | 1 | 0.056 | 0.5 | 1 | spiral | — |
| brood-2 | Spinner | 1 | 0.046 | 0.9 | 2 | spiral | spawn brood-1 /150 |
| brood-3 | Splitter | 2 | 0.036 | 1.1 | 3 | spiral | split ×2 brood-1 |
| brood-4 | Matron | 3 | 0.026 | 1.5 | 4 | spiral | spawn brood-1 /120 |
| boss-maw | The Maw | 5 | 0.020 | 2.6 | 4 | chase | heal-aura r7 +1/150 |
| boss-spire | Gloomspire | 4 | 0.022 | 2.4 | 4 | orbit-then-dive | teleport/110 r6 |
| boss-iron | Ironclad | 5 | 0.018 | 3.0 | 4 | dash-pause | armored-front r7 |
| boss-hive | Hivemind | 4 | 0.022 | 2.5 | 4 | spiral | spawn brood-1 /90 |
| boss-choir | Phantom Choir | 4 | 0.026 | 2.3 | 4 | zigzag | cloak/50 |
| boss-sunder | Sunderer | 5 | 0.020 | 2.8 | 4 | flank | enrage-at-half ×2.0 |

- [ ] **Step 1: Write the roster validation test** (`enemies.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { ENEMIES, getArchetype, type MovementId } from "./enemies";

const MOVEMENTS: MovementId[] = [
	"chase",
	"zigzag",
	"orbit-then-dive",
	"dash-pause",
	"flank",
	"spiral",
];
const ABILITY_KINDS = [
	"split",
	"shield",
	"cloak",
	"spawn",
	"heal-aura",
	"enrage-at-half",
	"teleport",
	"armored-front",
];

describe("enemy roster", () => {
	it("has at least 30 archetypes", () => {
		expect(ENEMIES.length).toBeGreaterThanOrEqual(30);
	});

	it("has unique ids", () => {
		const ids = ENEMIES.map((e) => e.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("has 24 regulars and 6 bosses", () => {
		expect(ENEMIES.filter((e) => e.role === "regular").length).toBe(24);
		expect(ENEMIES.filter((e) => e.role === "boss").length).toBe(6);
	});

	it("has valid stats, movement and tier on every entry", () => {
		for (const e of ENEMIES) {
			expect(e.hp).toBeGreaterThan(0);
			expect(e.speed).toBeGreaterThan(0);
			expect(e.size).toBeGreaterThan(0);
			expect([1, 2, 3, 4]).toContain(e.tier);
			expect(MOVEMENTS).toContain(e.movement);
		}
	});

	it("covers all four tiers and all six movements", () => {
		for (const t of [1, 2, 3, 4]) {
			expect(ENEMIES.some((e) => e.tier === t)).toBe(true);
		}
		for (const m of MOVEMENTS) {
			expect(ENEMIES.some((e) => e.movement === m)).toBe(true);
		}
	});

	it("uses every ability kind at least once with valid minion refs", () => {
		const ids = new Set(ENEMIES.map((e) => e.id));
		const seen = new Set<string>();
		for (const e of ENEMIES) {
			if (!e.ability) continue;
			expect(ABILITY_KINDS).toContain(e.ability.kind);
			seen.add(e.ability.kind);
			if (e.ability.kind === "split" || e.ability.kind === "spawn") {
				expect(ids.has(e.ability.minion)).toBe(true);
			}
		}
		for (const kind of ABILITY_KINDS) expect(seen.has(kind)).toBe(true);
	});

	it("bosses are multi-word chains (hp 3-5)", () => {
		for (const b of ENEMIES.filter((e) => e.role === "boss")) {
			expect(b.hp).toBeGreaterThanOrEqual(3);
			expect(b.hp).toBeLessThanOrEqual(5);
		}
	});

	it("looks up by id and throws on unknown", () => {
		expect(getArchetype("husk-1").name).toBe("Huskling");
		expect(() => getArchetype("nope")).toThrow();
	});
});
```

- [ ] **Step 2: Run to fail** — `pnpm test:run -- src/lib/game/content/enemies.test.ts` → FAIL.

- [ ] **Step 3: Replace `ENEMIES`** in `enemies.ts` (keep the `MovementId`, `Ability`, `EnemyArchetype` types, `getArchetype`, and `byId` map exactly as Plan 2 defined them; only the array changes)

```ts
export const ENEMIES: EnemyArchetype[] = [
	// Husk family — chase
	{ id: "husk-1", name: "Huskling", hp: 1, speed: 0.05, size: 0.7, tier: 1, movement: "chase", ability: null, role: "regular" },
	{ id: "husk-2", name: "Husk", hp: 1, speed: 0.044, size: 0.9, tier: 2, movement: "chase", ability: null, role: "regular" },
	{ id: "husk-3", name: "Ravener", hp: 2, speed: 0.034, size: 1.2, tier: 3, movement: "chase", ability: { kind: "enrage-at-half", speedMult: 1.8 }, role: "regular" },
	{ id: "husk-4", name: "Colossus Husk", hp: 3, speed: 0.024, size: 1.7, tier: 4, movement: "chase", ability: { kind: "heal-aura", radius: 5, amount: 1, interval: 180 }, role: "regular" },
	// Darter family — zigzag
	{ id: "darter-1", name: "Nit", hp: 1, speed: 0.058, size: 0.6, tier: 1, movement: "zigzag", ability: null, role: "regular" },
	{ id: "darter-2", name: "Flitter", hp: 1, speed: 0.05, size: 0.8, tier: 2, movement: "zigzag", ability: { kind: "cloak", interval: 45 }, role: "regular" },
	{ id: "darter-3", name: "Shade Darter", hp: 2, speed: 0.04, size: 1.0, tier: 3, movement: "zigzag", ability: { kind: "cloak", interval: 35 }, role: "regular" },
	{ id: "darter-4", name: "Voidwing", hp: 3, speed: 0.03, size: 1.4, tier: 4, movement: "zigzag", ability: { kind: "teleport", interval: 120, range: 4 }, role: "regular" },
	// Wraith family — orbit-then-dive
	{ id: "wraith-1", name: "Wisp", hp: 1, speed: 0.052, size: 0.6, tier: 1, movement: "orbit-then-dive", ability: null, role: "regular" },
	{ id: "wraith-2", name: "Haunt", hp: 1, speed: 0.046, size: 0.9, tier: 2, movement: "orbit-then-dive", ability: { kind: "teleport", interval: 150, range: 3 }, role: "regular" },
	{ id: "wraith-3", name: "Phantom", hp: 2, speed: 0.036, size: 1.1, tier: 3, movement: "orbit-then-dive", ability: { kind: "cloak", interval: 40 }, role: "regular" },
	{ id: "wraith-4", name: "Revenant", hp: 3, speed: 0.028, size: 1.5, tier: 4, movement: "orbit-then-dive", ability: { kind: "teleport", interval: 100, range: 5 }, role: "regular" },
	// Charger family — dash-pause
	{ id: "charger-1", name: "Tick", hp: 1, speed: 0.048, size: 0.7, tier: 1, movement: "dash-pause", ability: null, role: "regular" },
	{ id: "charger-2", name: "Rammer", hp: 2, speed: 0.042, size: 1.0, tier: 2, movement: "dash-pause", ability: { kind: "enrage-at-half", speedMult: 1.6 }, role: "regular" },
	{ id: "charger-3", name: "Gorehoof", hp: 2, speed: 0.034, size: 1.3, tier: 3, movement: "dash-pause", ability: { kind: "enrage-at-half", speedMult: 1.8 }, role: "regular" },
	{ id: "charger-4", name: "Juggernaut", hp: 4, speed: 0.024, size: 1.8, tier: 4, movement: "dash-pause", ability: { kind: "armored-front", exposeRadius: 5 }, role: "regular" },
	// Weaver family — flank
	{ id: "weaver-1", name: "Creeper", hp: 1, speed: 0.05, size: 0.7, tier: 1, movement: "flank", ability: { kind: "shield", hits: 1 }, role: "regular" },
	{ id: "weaver-2", name: "Lancer", hp: 2, speed: 0.042, size: 1.0, tier: 2, movement: "flank", ability: { kind: "shield", hits: 2 }, role: "regular" },
	{ id: "weaver-3", name: "Bulwark", hp: 2, speed: 0.032, size: 1.3, tier: 3, movement: "flank", ability: { kind: "armored-front", exposeRadius: 4 }, role: "regular" },
	{ id: "weaver-4", name: "Aegis", hp: 3, speed: 0.026, size: 1.6, tier: 4, movement: "flank", ability: { kind: "armored-front", exposeRadius: 6 }, role: "regular" },
	// Brood family — spiral
	{ id: "brood-1", name: "Broodling", hp: 1, speed: 0.056, size: 0.5, tier: 1, movement: "spiral", ability: null, role: "regular" },
	{ id: "brood-2", name: "Spinner", hp: 1, speed: 0.046, size: 0.9, tier: 2, movement: "spiral", ability: { kind: "spawn", minion: "brood-1", rate: 150 }, role: "regular" },
	{ id: "brood-3", name: "Splitter", hp: 2, speed: 0.036, size: 1.1, tier: 3, movement: "spiral", ability: { kind: "split", n: 2, minion: "brood-1" }, role: "regular" },
	{ id: "brood-4", name: "Matron", hp: 3, speed: 0.026, size: 1.5, tier: 4, movement: "spiral", ability: { kind: "spawn", minion: "brood-1", rate: 120 }, role: "regular" },
	// Bosses — role "boss", hp = word-chain length (4-5)
	{ id: "boss-maw", name: "The Maw", hp: 5, speed: 0.02, size: 2.6, tier: 4, movement: "chase", ability: { kind: "heal-aura", radius: 7, amount: 1, interval: 150 }, role: "boss" },
	{ id: "boss-spire", name: "Gloomspire", hp: 4, speed: 0.022, size: 2.4, tier: 4, movement: "orbit-then-dive", ability: { kind: "teleport", interval: 110, range: 6 }, role: "boss" },
	{ id: "boss-iron", name: "Ironclad", hp: 5, speed: 0.018, size: 3.0, tier: 4, movement: "dash-pause", ability: { kind: "armored-front", exposeRadius: 7 }, role: "boss" },
	{ id: "boss-hive", name: "Hivemind", hp: 4, speed: 0.022, size: 2.5, tier: 4, movement: "spiral", ability: { kind: "spawn", minion: "brood-1", rate: 90 }, role: "boss" },
	{ id: "boss-choir", name: "Phantom Choir", hp: 4, speed: 0.026, size: 2.3, tier: 4, movement: "zigzag", ability: { kind: "cloak", interval: 50 }, role: "boss" },
	{ id: "boss-sunder", name: "Sunderer", hp: 5, speed: 0.02, size: 2.8, tier: 4, movement: "flank", ability: { kind: "enrage-at-half", speedMult: 2.0 }, role: "boss" },
];
```

- [ ] **Step 4: Run to pass** — Step 1 command → PASS.

- [ ] **Step 5: Update interim-id references in `combat.test.ts`**

Plan 2's `combat.test.ts` looked up the now-removed `grunt`/`brute`. Replace its `stateWithEnemy` helper and the two call sites so it uses real roster ids: `husk-1` (hp 1) and `husk-4` (hp 3, ability `heal-aura` which never absorbs completions). Replace the helper and the multi-hp test:

```ts
function stateWithEnemy(archetypeId: string): {
	s: GameState;
	enemyId: number;
} {
	const s = createInitialState(42);
	const arch = getArchetype(archetypeId);
	const enemy = createEnemy(
		arch,
		s.nextEnemyId,
		{ x: 5, y: 0 },
		0,
		arch.hp > 1 ? "clobbered" : "the",
	);
	s.nextEnemyId += 1;
	s.enemies = [enemy];
	s.targetId = enemy.id;
	return { s, enemyId: enemy.id };
}
```

Change the `stateWithEnemy("grunt")` calls to `stateWithEnemy("husk-1")` (both the `reassignWord` test and the `killEnemy` test), and change the `stateWithEnemy("brute")` call in the "3-hp" test to `stateWithEnemy("husk-4")`. Update that test's title/assertion to reference the hp-3 Colossus:

```ts
	it("a 3-hp enemy takes three completions to die, reassigning each time", () => {
		const { s } = stateWithEnemy("husk-4");
		const e = s.enemies[0];
		e.typedCount = e.word.length;
		resolveCompletion(s, e);
		expect(e.alive).toBe(true);
		expect(e.hp).toBe(2);
		e.typedCount = e.word.length;
		resolveCompletion(s, e);
		expect(e.hp).toBe(1);
		e.typedCount = e.word.length;
		resolveCompletion(s, e);
		expect(e.alive).toBe(false);
		expect(s.kills).toBe(1);
	});
```

- [ ] **Step 6: Update interim-id references in `powerups.test.ts`**

Replace the two `getArchetype("grunt")` calls in the "bomb kills every alive enemy" test with `getArchetype("husk-1")`:

```ts
		s.enemies = [
			createEnemy(getArchetype("husk-1"), 1, { x: 5, y: 0 }, 0, "the"),
			createEnemy(getArchetype("husk-1"), 2, { x: -5, y: 0 }, 0, "and"),
		];
```

- [ ] **Step 7: Repoint the interim selector + patch `spawner.test.ts` off the removed ids**

Plan 2's interim `selectArchetypeId` returns `"grunt"` and `spawner.test.ts` references `"grunt"` in two places — both now removed. Task 3 replaces the selector wholesale, but this task must stay green:

  1. In `spawner.ts`, change the interim body's return from `["grunt", next]` to `["husk-1", next]`.
  2. In `spawner.test.ts`, change `spawnFromArchetype(s, "grunt", { x: 20, y: 0 })` to `spawnFromArchetype(s, "husk-1", { x: 20, y: 0 })`, and change the selector assertion `expect(a).toBe("grunt")` to `expect(a).toBe("husk-1")`.

- [ ] **Step 8: Run the game suite** — `pnpm test:run -- src/lib/game` → green except the two golden fixtures (roster + interim id changed). Re-record both (Global Constraints procedure), re-run replay → PASS.

- [ ] **Step 9: Verify checks** — `pnpm typecheck && pnpm lint` → clean.

- [ ] **Step 10: Commit**

```bash
git add src/lib/game/content/enemies.ts src/lib/game/content/enemies.test.ts \
  src/lib/game/sim/combat.test.ts src/lib/game/sim/powerups.test.ts \
  src/lib/game/sim/spawner.ts src/lib/game/sim/spawner.test.ts \
  src/lib/game/sim/__fixtures__/replay-first-kill.json \
  src/lib/game/sim/__fixtures__/replay-deep-run.json
git commit
```

Commit message:

```
feat(game): add 30-enemy roster across six families and six bosses

Claude-Session: https://claude.ai/code/session_01N1YqXkNqwh76TbQtmr9DRC
```

---

### Task 3: Wave-banded spawner weighting

**Files:**
- Modify: `src/lib/game/sim/spawner.ts` (replace `selectArchetypeId` body)
- Modify: `src/lib/game/sim/spawner.test.ts`

**Interfaces:**
- Consumes: `ENEMIES` (`../content/enemies`), `nextFloat`/`nextInt` (`./rng`).
- Produces: same `selectArchetypeId(wave, rngState) → [id, next]` signature (unchanged), now weighting regulars by wave-gated tiers and fielding a boss on boss waves.

Tier unlock + weighting: tier 1 from wave 1, tier 2 from wave 3, tier 3 from wave 6, tier 4 from wave 10. Low tiers dominate early and fade; high tiers ramp up. On every 5th wave (`wave % 5 === 0`), a ~1-in-3 draw fields a random boss; otherwise the weighted regular pick applies.

- [ ] **Step 1: Rewrite the spawner test's selection cases** (`spawner.test.ts`)

Replace the two `selectArchetypeId` tests (the "deterministic and returns a known id" and any grunt-specific assertion) with wave-aware checks. Keep the `waveEnemyCount`, `spawnFromArchetype`, wave-phase, and MAX_ALIVE tests from Plan 2 as-is. New selection tests:

```ts
	it("selectArchetypeId is deterministic and returns a roster id", () => {
		const ids = new Set(
			(await import("../content/enemies")).ENEMIES.map((e) => e.id),
		);
		const [a, na] = selectArchetypeId(1, createRngState(3));
		const [b, nb] = selectArchetypeId(1, createRngState(3));
		expect(a).toBe(b);
		expect(na).toBe(nb);
		expect(ids.has(a)).toBe(true);
	});

	it("early waves only field tier-1 regulars", () => {
		const roster = new Map(
			(await import("../content/enemies")).ENEMIES.map((e) => [e.id, e]),
		);
		let s = createRngState(11);
		for (let i = 0; i < 40; i++) {
			const [id, n] = selectArchetypeId(1, s);
			const arch = roster.get(id);
			expect(arch?.tier).toBe(1);
			expect(arch?.role).toBe("regular");
			s = n;
		}
	});

	it("later waves can field higher-tier regulars", () => {
		const roster = new Map(
			(await import("../content/enemies")).ENEMIES.map((e) => [e.id, e]),
		);
		let s = createRngState(11);
		let sawHigher = false;
		for (let i = 0; i < 200; i++) {
			const [id, n] = selectArchetypeId(12, s);
			if ((roster.get(id)?.tier ?? 1) > 1) sawHigher = true;
			s = n;
		}
		expect(sawHigher).toBe(true);
	});

	it("boss waves can field a boss", () => {
		const roster = new Map(
			(await import("../content/enemies")).ENEMIES.map((e) => [e.id, e]),
		);
		let s = createRngState(11);
		let sawBoss = false;
		for (let i = 0; i < 200; i++) {
			const [id, n] = selectArchetypeId(10, s);
			if (roster.get(id)?.role === "boss") sawBoss = true;
			s = n;
		}
		expect(sawBoss).toBe(true);
	});
```

Mark the containing test callbacks `async` where they use `await import(...)` (change `it("…", () => {` to `it("…", async () => {` for these four).

- [ ] **Step 2: Run to fail** — `pnpm test:run -- src/lib/game/sim/spawner.test.ts` → FAIL (interim selector only ever returns `"husk-1"`).

- [ ] **Step 3: Replace `selectArchetypeId`** in `spawner.ts`

Update the imports to include the roster and `nextInt` (the full import block for `spawner.ts` after this task):

```ts
import { ENEMIES, getArchetype } from "../content/enemies";
import { pickWordForTier } from "../content/words";
import { createEnemy } from "./enemy-factory";
import { nextFloat, nextInt } from "./rng";
import { ARENA, type GameState, type Vec2 } from "./state";
```

(`getArchetype` stays — `spawnFromArchetype` still uses it.)

Replace the entire interim `selectArchetypeId` function with:

```ts
type Tier = 1 | 2 | 3 | 4;
const UNLOCK: Record<Tier, number> = { 1: 1, 2: 3, 3: 6, 4: 10 };

function tierWeight(tier: Tier, wave: number): number {
	if (wave < UNLOCK[tier]) return 0;
	switch (tier) {
		case 1:
			return Math.max(1, 10 - wave * 2);
		case 2:
			return Math.min(8, wave - 1);
		case 3:
			return Math.min(8, wave - 4);
		case 4:
			return Math.min(8, wave - 8);
	}
}

const REGULARS = ENEMIES.filter((e) => e.role === "regular");
const BOSSES = ENEMIES.filter((e) => e.role === "boss");

export function selectArchetypeId(
	wave: number,
	rngState: number,
): [id: string, next: number] {
	// boss waves: ~1-in-3 chance to field a boss
	let state = rngState;
	if (wave % 5 === 0) {
		const [roll, r1] = nextFloat(state);
		state = r1;
		if (roll < 0.34) {
			const [bi, r2] = nextInt(state, BOSSES.length);
			return [BOSSES[bi].id, r2];
		}
	}

	// weighted pick over unlocked regulars
	let total = 0;
	for (const e of REGULARS) total += tierWeight(e.tier as Tier, wave);
	if (total <= 0) return [REGULARS[0].id, state];

	const [f, next] = nextFloat(state);
	let roll = f * total;
	for (const e of REGULARS) {
		roll -= tierWeight(e.tier as Tier, wave);
		if (roll < 0) return [e.id, next];
	}
	return [REGULARS[REGULARS.length - 1].id, next];
}
```

- [ ] **Step 4: Run to pass** — Step 1 command → PASS.

- [ ] **Step 5: Run the game suite** — `pnpm test:run -- src/lib/game` → green except the two golden fixtures (spawn selection changed). Re-record both, re-run replay → PASS.

- [ ] **Step 6: Verify checks** — `pnpm typecheck && pnpm lint` → clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/game/sim/spawner.ts src/lib/game/sim/spawner.test.ts \
  src/lib/game/sim/__fixtures__/replay-first-kill.json \
  src/lib/game/sim/__fixtures__/replay-deep-run.json
git commit
```

Commit message:

```
feat(game): weight enemy spawns by wave with boss waves

Claude-Session: https://claude.ai/code/session_01N1YqXkNqwh76TbQtmr9DRC
```

---

### Task 4: Full verification + docs + push

**Files:**
- Modify: `docs/game-design.md` (roster/content section)

- [ ] **Step 1: Append a roster section to `docs/game-design.md`**

Add under the existing content:

```markdown
## Content breadth (Plan 3)

- **Roster:** 30 archetypes in `src/lib/game/content/enemies.ts` — 24 regulars
  (6 families × 4 tiers: Husk/chase, Darter/zigzag, Wraith/orbit-then-dive,
  Charger/dash-pause, Weaver/flank, Brood/spiral) + 6 word-chain bosses. All
  eight abilities and all six movements are represented; `split`/`spawn` minions
  reference `brood-1`.
- **Word bands:** `pickWordForTier(tier, rng, excludeInitials)` draws from length
  bands over `english-1k` (tiers 1–2) and `english-5k` (tiers 3–4). Enemies draw
  from their tier; boss chains reassign within the tier-4 band per completion.
- **Spawner:** `selectArchetypeId(wave, rng)` weights regulars by wave-gated tiers
  (tier unlocks at waves 1/3/6/10) and fields a boss on every 5th wave.
- **Determinism:** golden fixtures (`replay-first-kill.json`, `replay-deep-run.json`)
  re-recorded via `RECORD_FIXTURE=1 pnpm test:run -- src/lib/game/sim/replay.test.ts`.
```

- [ ] **Step 2: Full suite + build**

Run: `pnpm typecheck && pnpm lint && pnpm test:run && pnpm build`
Expected: all green; Babylon stays in the lazy `/game` chunk (main bundle unchanged).

- [ ] **Step 3: Commit + push**

```bash
git add docs/game-design.md
git commit
git push
```

Commit message:

```
docs(game): document enemy roster, word bands and spawner weighting

Claude-Session: https://claude.ai/code/session_01N1YqXkNqwh76TbQtmr9DRC
```

- [ ] **Step 4: Watch CI green** — `gh run watch <id> --exit-status`.

---

## After this plan

Run `/code-review` on the roster diff (major junction 3). Remaining spec phases: render
polish + asset-pipeline decision gate (Plan 4), then HUD/screens, Dexie `gameRuns`
persistence, ModeSelector "Horde" entry, and docs finish (Plan 5). See spec §11.

## Self-Review Notes

- **Spec coverage (§5–§6):** roster ≥30 with 6 families × 4 tiers + 6 bosses (Task 2),
  per-tier word bands from `english-1k`/`english-5k` (Task 1), roster validation —
  length ≥30, unique ids, valid movement/ability refs, band coverage (Task 2 test),
  spawner weighting by wave (Task 3). Boss word chains are realised through Plan 2's
  multi-hp reassignment within the tier-4 band (hp 4–5 = chain length).
- **Data shape verified:** both JSON files are `string[]`; `resolveJsonModule: true` in
  `tsconfig.json` permits the static default import; the loader (`band()` filter over the
  imported array) matches that reality.
- **Type consistency with Plan 2:** `EnemyArchetype`/`MovementId`/`Ability`/`role`/`tier`
  are consumed exactly as Plan 2 defined them (no new archetype fields). `pickWord`,
  `pickWordForTier`, `selectArchetypeId`, `spawnFromArchetype`, `reassignWord` keep the
  signatures Plan 2 pinned; only interior bodies change.
- **Cross-plan test hygiene:** every Plan 2 test that referenced the interim `grunt`/
  `brute` ids (`combat.test.ts`, `powerups.test.ts`, `spawner.test.ts`, `enemies.test.ts`)
  is migrated to real roster ids in the same task that removes those ids, so no commit is
  left red.
- **Placeholder scan:** the roster table, word bands, and weighting function are complete
  code; the only generated artefacts are the two golden-fixture JSON files, produced by
  the documented `RECORD_FIXTURE=1` command.
```
