# Horde Mode — Sim Depth Implementation Plan (Plan 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deepen the pure Horde simulation from a single-grunt tracer bullet into a real arcade sim: escalating waves with inter-wave pauses, six data-selected movement behaviours, eight minimal-state enemy abilities, multi-hp enemies with word reassignment (boss chains), combo/multiplier scoring with decay, and word-labelled powerups — all deterministic and replay-verified.

**Architecture:** Everything added lives under `src/lib/game/sim` (pure TypeScript, no Babylon/DOM/`Date.now`/`Math.random`) and `src/lib/game/content` (data). `step()` stays the sole state mutator; behaviours and abilities are pure functions selected by a data field on the enemy (no class hierarchies). Per-tick cost stays O(enemies): archetype data is denormalised onto each `EnemyState` at spawn, so the tick loop performs zero `Map` lookups. Randomness stays threaded through `rngState`; per-enemy movement variation comes from a pure hash of the enemy id (no state threading in the hot loop).

**Tech Stack:** TypeScript (strict), Vitest 4. Pure functions only — no new runtime dependencies.

## Global Constraints

- `src/lib/game/sim/**` and `src/lib/game/content/**` MUST NOT import Babylon, Solid, or touch DOM / `Date.now` / `Math.random`. All randomness flows through `rngState` via `rng.ts`; time = tick count.
- `step()` is the ONLY state mutator. It clones the input state to a working draft, and helper functions (in `combat.ts`, `abilities.ts`, `powerups.ts`, `spawner.ts`) mutate that draft — they are never called outside `step()`'s transaction. The input `GameState` is never mutated.
- Behaviours and abilities are **data-selected pure functions**, dispatched by a string field (`movement`) or a discriminated union (`ability`). No classes, no inheritance.
- Per-tick cost is O(alive enemies). No `Map`/`getArchetype` lookups inside the movement/ability tick loops — archetype fields (`speed`, `movement`, `ability`, `tier`) are denormalised onto `EnemyState` at spawn. Movement functions allocate at most one `Vec2` and call at most two trig functions each; no per-tick array allocations.
- `EnemyState` / `GameState` are extended **conservatively** — only the fields listed in each task, added in a fixed key order so `JSON.stringify` (used by `stateHash`) stays stable.
- Every commit keeps `pnpm typecheck && pnpm lint && pnpm test:run` green. Any task that changes sim behaviour or state shape re-records the golden replay fixture in that same task (procedure below) so the determinism guard never goes red.
- **Re-record golden fixture procedure** (introduced in Task 1): run `RECORD_FIXTURE=1 pnpm test:run -- src/lib/game/sim/replay.test.ts` (the guarded recorder writes `src/lib/game/sim/__fixtures__/replay-first-kill.json`), then `pnpm test:run -- src/lib/game/sim/replay.test.ts` → PASS. `git add` the regenerated JSON with the task's commit.
- Repo style: tabs for indentation, double quotes, Biome formatting. Commit format `type(game): …` with a trailer line. Every commit message ends with:

  ```
  Claude-Session: https://claude.ai/code/session_01N1YqXkNqwh76TbQtmr9DRC
  ```
- TDD: write the failing test first, watch it fail, write minimal code, watch it pass.

## Addendum A — Determinism & Pruning Reconciliation (BINDING)

Post-skeleton review fixes changed sim ground rules AFTER this plan was drafted. These
overrides apply to every task here and in Plan 3. Where a code snippet below conflicts,
apply these rules mechanically — the rules win.

**A1. Deterministic math only.** The ES spec makes `Math.cos/sin/tan/hypot`
implementation-approximated (not identical across JS engines); `Math.sqrt`, `+ - * /`,
and integer ops ARE exact. Sim/content sources may use only those. Task 0 (below)
creates `src/lib/game/sim/math.ts`:

```ts
export function dist(x: number, y: number): number; // Math.sqrt(x*x + y*y)
export function sinR(rad: number): number; // deterministic polynomial, |err| < 2e-3
export function cosR(rad: number): number; // sinR(rad + PI/2) style
export function randomPointOnCircle(
	rngState: number,
	radius: number,
): [pos: Vec2, next: number]; // rejection-sampled unit vector × radius
```

`sinR`: range-reduce the angle to [-π, π] with arithmetic only, then a degree-7
polynomial approximation (Taylor or minimax — arithmetic ops only). Accuracy test
compares against `Math.sin` within 2e-3 across [-10π, 10π] (test files are exempt
from the scan, so `Math.sin` in tests is fine). `randomPointOnCircle`: draw
`ux, uy ∈ [-1, 1]` via two `nextFloat` calls, retry while `len2 = ux*ux + uy*uy > 1`
or `< 1e-4` (each retry consumes rng state), normalise with `Math.sqrt(len2)`, scale
by `radius`.

Task 0 also extends the review-fix source scan (`determinism.test.ts`) to glob EVERY
non-test `.ts` under `src/lib/game/sim/` and `src/lib/game/content/`, asserting no
match of `/Math\.(hypot|cos|sin|tan|random)|Date\.now/`.

Mechanical substitutions when transcribing plan snippets into sim/content sources
(test-file snippets may keep `Math.hypot`/`Math.sin` as written):

- `Math.hypot(a, b)` → `dist(a, b)`
- `Math.sin(x)` → `sinR(x)`, `Math.cos(x)` → `cosR(x)`
- every "pick angle via `nextFloat`, place with cos/sin on a radius" spawn block →
  `const [pos, r] = randomPointOnCircle(s.rngState, ARENA.spawnRadius); s.rngState = r;`
  (this matches the review-fix spawn already in `step.ts` — reuse it, do not revert it)
- split-minion rings / powerup ring placement → `cosR`/`sinR`.

**A2. Dead-enemy pruning.** A review fix makes `step()` REMOVE non-alive enemies from
`state.enemies` at the end of each tick (unbounded-growth fix). Keep that behaviour.
`killEnemy` still sets `alive = false` (same-tick logic and direct-call unit tests see
it). Any plan test that asserts a dead enemy is still in the array AFTER a full
`step()` must instead assert absence (`s.enemies.find((x) => x.id === id)` is
`undefined`). `filter((e) => e.alive)` expressions remain valid.

**A3. Hash sharing.** `stateHash` now delegates to `fnv1a` exported from
`src/lib/core/text/hash.ts` (review fix). Keep it; the recorder is unaffected.

---

### Task 0: Deterministic math module

**Files:**
- Create: `src/lib/game/sim/math.ts`
- Create: `src/lib/game/sim/math.test.ts`
- Modify: `src/lib/game/sim/determinism.test.ts` (widen source scan per A1)

Follow A1 exactly: failing tests first (`dist` exactness vs manual sqrt, `sinR`/`cosR`
accuracy bounds, `randomPointOnCircle` determinism + radius within 1e-9 + state
advance), then implement, then widen the scan glob. Commit:

```
feat(game): add deterministic math module for cross-engine sim stability

Claude-Session: https://claude.ai/code/session_01N1YqXkNqwh76TbQtmr9DRC
```

---

### Task 1: Golden-fixture recorder tooling

**Files:**
- Modify: `src/lib/game/sim/replay.test.ts`
- Modify: `src/lib/game/sim/__fixtures__/replay-first-kill.json` (regenerated)

**Interfaces:**
- Consumes: `runReplay`, `stateHash` (`./replay`), `createInitialState` (`./state`), `step` (`./step`).
- Produces: a probe-based, timing-independent fixture generator + an env-guarded recorder test. Every later task re-runs this recorder instead of hand-editing the fixture.

- [ ] **Step 1: Replace `replay.test.ts` with the probe-based recorder + assert**

The current fixture hard-codes keystrokes at ticks 182–186, which will break the moment spawn timing changes. Replace it with a generator that *probes* the deterministic sim to discover the first enemy's word, so re-recording stays correct across every later behaviour change.

```ts
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type InputLog, runReplay, stateHash } from "./replay";
import { createInitialState } from "./state";
import { step } from "./step";

/**
 * Build a deterministic "type the first enemy to death" log by probing the
 * sim: advance untyped until an enemy is alive, read its word, then script
 * the keystrokes. Because the sim is a pure deterministic fold, replaying
 * this log from scratch reproduces the exact same enemy and word.
 */
function buildFirstKillLog(seed: number): InputLog {
	let s = createInitialState(seed);
	let tick = 0;
	while (s.enemies.filter((e) => e.alive).length === 0 && tick < 4000) {
		s = step(s, []);
		tick = s.tick;
	}
	const enemy = s.enemies.find((e) => e.alive);
	const word = enemy ? enemy.word : "";
	const events = [...word].map((key, i) => ({ tick: tick + 1 + i, key }));
	return { seed, ticks: tick + word.length + 30, events };
}

describe("replay", () => {
	it("replays a probed kill deterministically", () => {
		const log = buildFirstKillLog(42);
		const a = runReplay(log);
		const b = runReplay(log);
		expect(a.kills).toBeGreaterThanOrEqual(1);
		expect(stateHash(a)).toBe(stateHash(b));
	});

	it("hash changes when the seed changes", () => {
		const base: InputLog = { seed: 42, ticks: 600, events: [] };
		const other: InputLog = { seed: 43, ticks: 600, events: [] };
		expect(stateHash(runReplay(base))).not.toBe(stateHash(runReplay(other)));
	});

	it("matches the golden fixture hash", async () => {
		const fixture = await import("./__fixtures__/replay-first-kill.json");
		const result = runReplay(fixture.log as InputLog);
		expect(stateHash(result)).toBe(fixture.expectedHash);
		expect(result.kills).toBe(fixture.expectedKills);
	});

	// Env-guarded: regenerates the committed fixture from the current sim.
	// Run: RECORD_FIXTURE=1 pnpm test:run -- src/lib/game/sim/replay.test.ts
	it("[record] regenerate golden fixture", () => {
		if (!process.env.RECORD_FIXTURE) return;
		const log = buildFirstKillLog(42);
		const result = runReplay(log);
		const fixture = {
			log,
			expectedHash: stateHash(result),
			expectedKills: result.kills,
		};
		writeFileSync(
			new URL("./__fixtures__/replay-first-kill.json", import.meta.url),
			`${JSON.stringify(fixture, null, "\t")}\n`,
		);
	});
});
```

- [ ] **Step 2: Regenerate the fixture**

Run: `RECORD_FIXTURE=1 pnpm test:run -- src/lib/game/sim/replay.test.ts`
Expected: PASS; `replay-first-kill.json` rewritten to the probe-based log.

- [ ] **Step 3: Verify the guard is green**

Run: `pnpm test:run -- src/lib/game/sim/replay.test.ts`
Expected: PASS (all four tests).

- [ ] **Step 4: Commit**

```bash
git add src/lib/game/sim/replay.test.ts src/lib/game/sim/__fixtures__/replay-first-kill.json
git commit
```

Commit message:

```
test(game): add probe-based re-recordable golden replay fixture

Claude-Session: https://claude.ai/code/session_01N1YqXkNqwh76TbQtmr9DRC
```

---

### Task 2: Enemy state + archetype extension + spawn factory

**Files:**
- Modify: `src/lib/game/content/enemies.ts`
- Modify: `src/lib/game/content/enemies.test.ts`
- Create: `src/lib/game/sim/enemy-factory.ts`
- Create: `src/lib/game/sim/enemy-factory.test.ts`
- Modify: `src/lib/game/sim/state.ts`
- Modify: `src/lib/game/sim/step.ts`

**Interfaces:**
- Consumes: `nextFloat` (`./rng`), `pickWord` (`../content/words`), `ARENA` (`./state`).
- Produces:

```ts
// content/enemies.ts
export type MovementId =
	| "chase"
	| "zigzag"
	| "orbit-then-dive"
	| "dash-pause"
	| "flank"
	| "spiral";
export type Ability =
	| { kind: "split"; n: number; minion: string }
	| { kind: "shield"; hits: number }
	| { kind: "cloak"; interval: number }
	| { kind: "spawn"; minion: string; rate: number }
	| { kind: "heal-aura"; radius: number; amount: number; interval: number }
	| { kind: "enrage-at-half"; speedMult: number }
	| { kind: "teleport"; interval: number; range: number }
	| { kind: "armored-front"; exposeRadius: number };
export type EnemyArchetype = {
	id: string;
	name: string;
	hp: number;
	speed: number;
	size: number;
	tier: 1 | 2 | 3 | 4;
	movement: MovementId;
	ability: Ability | null;
	role: "regular" | "boss";
};
export const ENEMIES: EnemyArchetype[];
export function getArchetype(id: string): EnemyArchetype;

// state.ts
export type AbilityState = { shieldHits: number; enraged: boolean };
export type EnemyState = {
	id: number;
	archetypeId: string;
	pos: Vec2;
	word: string;
	typedCount: number;
	hp: number;
	maxHp: number;
	alive: boolean;
	spawnTick: number;
	speed: number;
	tier: 1 | 2 | 3 | 4;
	movement: MovementId;
	ability: Ability | null;
	abilityState: AbilityState;
};

// enemy-factory.ts
export function initAbilityState(ability: Ability | null): AbilityState;
export function createEnemy(
	arch: EnemyArchetype,
	id: number,
	pos: Vec2,
	spawnTick: number,
	word: string,
): EnemyState;
```

- [ ] **Step 1: Extend the archetype table (failing test first)**

Replace `src/lib/game/content/enemies.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { ENEMIES, getArchetype } from "./enemies";

describe("enemy content", () => {
	it("has valid archetypes with movement + role", () => {
		expect(ENEMIES.length).toBeGreaterThanOrEqual(1);
		for (const e of ENEMIES) {
			expect(e.hp).toBeGreaterThan(0);
			expect(e.speed).toBeGreaterThan(0);
			expect(typeof e.movement).toBe("string");
			expect(["regular", "boss"]).toContain(e.role);
		}
	});
	it("looks up by id and throws on unknown", () => {
		expect(getArchetype("grunt").name).toBe("Grunt");
		expect(getArchetype("grunt").movement).toBe("chase");
		expect(() => getArchetype("nope")).toThrow();
	});
});
```

- [ ] **Step 2: Run to fail** — `pnpm test:run -- src/lib/game/content/enemies.test.ts` → FAIL (`movement`/`role` undefined).

- [ ] **Step 3: Implement the extended archetype** (`enemies.ts`)

```ts
export type MovementId =
	| "chase"
	| "zigzag"
	| "orbit-then-dive"
	| "dash-pause"
	| "flank"
	| "spiral";

export type Ability =
	| { kind: "split"; n: number; minion: string }
	| { kind: "shield"; hits: number }
	| { kind: "cloak"; interval: number }
	| { kind: "spawn"; minion: string; rate: number }
	| { kind: "heal-aura"; radius: number; amount: number; interval: number }
	| { kind: "enrage-at-half"; speedMult: number }
	| { kind: "teleport"; interval: number; range: number }
	| { kind: "armored-front"; exposeRadius: number };

export type EnemyArchetype = {
	id: string;
	name: string;
	hp: number;
	speed: number;
	size: number;
	tier: 1 | 2 | 3 | 4;
	movement: MovementId;
	ability: Ability | null;
	role: "regular" | "boss";
};

export const ENEMIES: EnemyArchetype[] = [
	{
		id: "grunt",
		name: "Grunt",
		hp: 1,
		speed: 0.04,
		size: 0.8,
		tier: 1,
		movement: "chase",
		ability: null,
		role: "regular",
	},
];

const byId = new Map(ENEMIES.map((e) => [e.id, e]));

export function getArchetype(id: string): EnemyArchetype {
	const found = byId.get(id);
	if (!found) throw new Error(`Unknown enemy archetype: ${id}`);
	return found;
}
```

- [ ] **Step 4: Run to pass** — same command → PASS.

- [ ] **Step 5: Extend `EnemyState` + `AbilityState` in `state.ts`**

Replace the `EnemyState` type (and add `AbilityState` + the `MovementId`/`Ability` re-imports) in `src/lib/game/sim/state.ts`. Keep the existing `Vec2`, `GameStatus`, `GameState`, `ARENA`, `createInitialState`. New top of file:

```ts
import type { Ability, MovementId } from "../content/enemies";
import { createRngState } from "./rng";

export type Vec2 = { x: number; y: number };
export type AbilityState = { shieldHits: number; enraged: boolean };
export type EnemyState = {
	id: number;
	archetypeId: string;
	pos: Vec2;
	word: string;
	typedCount: number;
	hp: number;
	maxHp: number;
	alive: boolean;
	spawnTick: number;
	speed: number;
	tier: 1 | 2 | 3 | 4;
	movement: MovementId;
	ability: Ability | null;
	abilityState: AbilityState;
};
```

Leave `GameStatus`, `GameState`, `ARENA`, and `createInitialState` exactly as they are.

- [ ] **Step 6: Write the factory test** (`enemy-factory.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import type { EnemyArchetype } from "../content/enemies";
import { createEnemy, initAbilityState } from "./enemy-factory";

const shielded: EnemyArchetype = {
	id: "test-shielded",
	name: "Test",
	hp: 3,
	speed: 0.03,
	size: 1,
	tier: 2,
	movement: "zigzag",
	ability: { kind: "shield", hits: 2 },
	role: "regular",
};

describe("enemy-factory", () => {
	it("initialises ability state from a shield ability", () => {
		expect(initAbilityState(shielded.ability)).toEqual({
			shieldHits: 2,
			enraged: false,
		});
	});
	it("initialises empty ability state for no ability", () => {
		expect(initAbilityState(null)).toEqual({ shieldHits: 0, enraged: false });
	});
	it("denormalises archetype fields onto the enemy", () => {
		const e = createEnemy(shielded, 7, { x: 1, y: 2 }, 100, "word");
		expect(e.id).toBe(7);
		expect(e.hp).toBe(3);
		expect(e.maxHp).toBe(3);
		expect(e.speed).toBe(0.03);
		expect(e.tier).toBe(2);
		expect(e.movement).toBe("zigzag");
		expect(e.spawnTick).toBe(100);
		expect(e.abilityState.shieldHits).toBe(2);
		expect(e.alive).toBe(true);
	});
});
```

- [ ] **Step 7: Run to fail** — `pnpm test:run -- src/lib/game/sim/enemy-factory.test.ts` → FAIL.

- [ ] **Step 8: Implement the factory** (`enemy-factory.ts`)

```ts
import type { Ability, EnemyArchetype } from "../content/enemies";
import type { AbilityState, EnemyState, Vec2 } from "./state";

export function initAbilityState(ability: Ability | null): AbilityState {
	return {
		shieldHits: ability?.kind === "shield" ? ability.hits : 0,
		enraged: false,
	};
}

export function createEnemy(
	arch: EnemyArchetype,
	id: number,
	pos: Vec2,
	spawnTick: number,
	word: string,
): EnemyState {
	return {
		id,
		archetypeId: arch.id,
		pos,
		word,
		typedCount: 0,
		hp: arch.hp,
		maxHp: arch.hp,
		alive: true,
		spawnTick,
		speed: arch.speed,
		tier: arch.tier,
		movement: arch.movement,
		ability: arch.ability,
		abilityState: initAbilityState(arch.ability),
	};
}
```

- [ ] **Step 9: Run to pass** — Step 6 command → PASS.

- [ ] **Step 10: Refactor `step.ts` spawn + clone to use the factory**

In `src/lib/game/sim/step.ts`, update the imports and the two affected regions. Change the import block to:

```ts
import { isCharMatch } from "@/lib/core/text/char-match";
import { getArchetype } from "../content/enemies";
import { pickWord } from "../content/words";
import { createEnemy } from "./enemy-factory";
import { nextFloat } from "./rng";
import { ARENA, type EnemyState, type GameState } from "./state";
```

Replace the working-draft clone so it also deep-copies `abilityState`:

```ts
	const s: GameState = {
		...state,
		tick: state.tick + 1,
		enemies: state.enemies.map((e) => ({
			...e,
			pos: { ...e.pos },
			abilityState: { ...e.abilityState },
		})),
	};
```

Replace the spawn block (the `if (s.tick % SPAWN_INTERVAL_TICKS === 0 && aliveCount < MAX_ALIVE)` body) so the enemy is built via the factory:

```ts
	// spawn
	const aliveCount = s.enemies.filter((e) => e.alive).length;
	if (s.tick % SPAWN_INTERVAL_TICKS === 0 && aliveCount < MAX_ALIVE) {
		const [angleT, r1] = nextFloat(s.rngState);
		const initials = new Set(
			s.enemies.filter((e) => e.alive).map((e) => e.word[0]),
		);
		const [word, r2] = pickWord(r1, initials);
		s.rngState = r2;
		const angle = angleT * Math.PI * 2;
		const arch = getArchetype("grunt");
		const pos = {
			x: Math.cos(angle) * ARENA.spawnRadius,
			y: Math.sin(angle) * ARENA.spawnRadius,
		};
		const enemy: EnemyState = createEnemy(arch, s.nextEnemyId, pos, s.tick, word);
		s.nextEnemyId += 1;
		s.enemies = [...s.enemies, enemy];
	}
```

Leave the movement loop, collision, and typing loop unchanged for now. Behaviour is identical; only `EnemyState` gained fields.

- [ ] **Step 11: Run the game suite** — `pnpm test:run -- src/lib/game` → all green except the golden-fixture hash (state shape grew). Then re-record (Global Constraints procedure) and re-run replay → PASS.

- [ ] **Step 12: Verify checks** — `pnpm typecheck && pnpm lint` → clean.

- [ ] **Step 13: Commit**

```bash
git add src/lib/game/content/enemies.ts src/lib/game/content/enemies.test.ts \
  src/lib/game/sim/enemy-factory.ts src/lib/game/sim/enemy-factory.test.ts \
  src/lib/game/sim/state.ts src/lib/game/sim/step.ts \
  src/lib/game/sim/__fixtures__/replay-first-kill.json
git commit
```

Commit message:

```
feat(game): denormalise archetype data onto enemy state with spawn factory

Claude-Session: https://claude.ai/code/session_01N1YqXkNqwh76TbQtmr9DRC
```

---

### Task 3: Movement behaviour functions

**Files:**
- Create: `src/lib/game/sim/movement.ts`
- Create: `src/lib/game/sim/movement.test.ts`
- Modify: `src/lib/game/sim/step.ts`

**Interfaces:**
- Consumes: `EnemyState`, `Vec2` (`./state`); `MovementId` (`../content/enemies`).
- Produces:

```ts
export type Noise = (salt: number) => number; // deterministic [0,1) from (enemyId, salt)
export function makeNoise(id: number): Noise;
export type MovementFn = (enemy: EnemyState, tick: number, rng?: Noise) => Vec2;
export const MOVEMENTS: Record<MovementId, MovementFn>;
```

`MovementFn` returns the per-tick displacement (velocity) vector for the enemy; `step` applies it and then resolves player collision. Each function allocates one `Vec2` and calls at most two trig functions. Per-enemy variation (phase, side) comes from `rng`, a pure hash of the enemy id — never from `rngState`, so movement stays a lookup-free O(enemies) loop.

- [ ] **Step 1: Write the failing test** (`movement.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { makeNoise, MOVEMENTS } from "./movement";
import type { EnemyState } from "./state";

function enemy(partial: Partial<EnemyState>): EnemyState {
	return {
		id: 1,
		archetypeId: "grunt",
		pos: { x: 10, y: 0 },
		word: "the",
		typedCount: 0,
		hp: 1,
		maxHp: 1,
		alive: true,
		spawnTick: 0,
		speed: 0.05,
		tier: 1,
		movement: "chase",
		ability: null,
		abilityState: { shieldHits: 0, enraged: false },
		...partial,
	};
}

describe("makeNoise", () => {
	it("is deterministic per id + salt and stays in [0,1)", () => {
		const n = makeNoise(42);
		expect(n(0)).toBe(makeNoise(42)(0));
		expect(n(0)).not.toBe(n(1));
		for (let i = 0; i < 100; i++) {
			expect(n(i)).toBeGreaterThanOrEqual(0);
			expect(n(i)).toBeLessThan(1);
		}
	});
	it("differs across ids", () => {
		expect(makeNoise(1)(0)).not.toBe(makeNoise(2)(0));
	});
});

describe("movement behaviours", () => {
	it("chase moves straight toward the origin at speed", () => {
		const e = enemy({ pos: { x: 10, y: 0 }, speed: 0.05 });
		const v = MOVEMENTS.chase(e, 0);
		expect(v.x).toBeCloseTo(-0.05, 6);
		expect(v.y).toBeCloseTo(0, 6);
	});

	it("every behaviour reduces distance to the origin over time", () => {
		for (const id of Object.keys(MOVEMENTS) as (keyof typeof MOVEMENTS)[]) {
			let e = enemy({ id: 3, movement: id, pos: { x: 12, y: 4 } });
			const rng = makeNoise(e.id);
			const start = Math.hypot(e.pos.x, e.pos.y);
			for (let t = 0; t < 3000; t++) {
				const v = MOVEMENTS[id](e, t, rng);
				e = { ...e, pos: { x: e.pos.x + v.x, y: e.pos.y + v.y } };
				if (Math.hypot(e.pos.x, e.pos.y) <= 1.2) break;
			}
			expect(Math.hypot(e.pos.x, e.pos.y)).toBeLessThan(start);
		}
	});

	it("returns a fresh vector without mutating the enemy", () => {
		const e = enemy({});
		const frozen = JSON.stringify(e);
		MOVEMENTS.spiral(e, 5, makeNoise(e.id));
		expect(JSON.stringify(e)).toBe(frozen);
	});
});
```

- [ ] **Step 2: Run to fail** — `pnpm test:run -- src/lib/game/sim/movement.test.ts` → FAIL.

- [ ] **Step 3: Implement** (`movement.ts`)

```ts
import type { MovementId } from "../content/enemies";
import type { EnemyState, Vec2 } from "./state";

/** Pure per-enemy noise: a hash of (id, salt) in [0,1). No state threading. */
export type Noise = (salt: number) => number;

export function makeNoise(id: number): Noise {
	return (salt: number) => {
		let h = (Math.imul(id | 0, 0x9e3779b1) + Math.imul(salt | 0, 0x85ebca77)) >>> 0;
		h = Math.imul(h ^ (h >>> 15), h | 1);
		h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
		return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
	};
}

export type MovementFn = (enemy: EnemyState, tick: number, rng?: Noise) => Vec2;

const TAU = Math.PI * 2;

const chase: MovementFn = (e) => {
	const d = Math.hypot(e.pos.x, e.pos.y) || 1;
	return { x: (-e.pos.x / d) * e.speed, y: (-e.pos.y / d) * e.speed };
};

const zigzag: MovementFn = (e, tick, rng) => {
	const d = Math.hypot(e.pos.x, e.pos.y) || 1;
	const inx = -e.pos.x / d;
	const iny = -e.pos.y / d;
	const phase = (rng ? rng(0) : 0) * TAU;
	const wobble = Math.sin((tick - e.spawnTick) * 0.15 + phase) * 0.6;
	// perpendicular of (inx, iny) is (-iny, inx)
	return {
		x: (inx - iny * wobble) * e.speed,
		y: (iny + inx * wobble) * e.speed,
	};
};

const ORBIT_TICKS = 120;
const orbitThenDive: MovementFn = (e, tick) => {
	const d = Math.hypot(e.pos.x, e.pos.y) || 1;
	const inx = -e.pos.x / d;
	const iny = -e.pos.y / d;
	if (tick - e.spawnTick < ORBIT_TICKS) {
		// mostly tangential, slight inward drift
		return {
			x: (-iny * 0.9 + inx * 0.1) * e.speed,
			y: (inx * 0.9 + iny * 0.1) * e.speed,
		};
	}
	return { x: inx * e.speed * 1.6, y: iny * e.speed * 1.6 };
};

const DASH_TICKS = 40;
const PAUSE_TICKS = 40;
const dashPause: MovementFn = (e, tick) => {
	const phase = (tick - e.spawnTick) % (DASH_TICKS + PAUSE_TICKS);
	if (phase >= DASH_TICKS) return { x: 0, y: 0 };
	const d = Math.hypot(e.pos.x, e.pos.y) || 1;
	return { x: (-e.pos.x / d) * e.speed * 2.2, y: (-e.pos.y / d) * e.speed * 2.2 };
};

const flank: MovementFn = (e, _tick, rng) => {
	const d = Math.hypot(e.pos.x, e.pos.y) || 1;
	const inx = -e.pos.x / d;
	const iny = -e.pos.y / d;
	const side = rng && rng(1) < 0.5 ? -1 : 1;
	const bias = Math.min(0.8, d / 20) * side; // more sideways when far, straightens in
	return { x: (inx - iny * bias) * e.speed, y: (iny + inx * bias) * e.speed };
};

const spiral: MovementFn = (e, _tick, rng) => {
	const d = Math.hypot(e.pos.x, e.pos.y) || 1;
	const inx = -e.pos.x / d;
	const iny = -e.pos.y / d;
	const dir = rng && rng(2) < 0.5 ? -1 : 1;
	const t = Math.min(1, d / 20); // 1 far, 0 near
	const tang = 0.9 * t * dir;
	const inward = 1 - 0.5 * t; // always some inward pull → guaranteed to close in
	return {
		x: (inx * inward - iny * tang) * e.speed,
		y: (iny * inward + inx * tang) * e.speed,
	};
};

export const MOVEMENTS: Record<MovementId, MovementFn> = {
	chase,
	zigzag,
	"orbit-then-dive": orbitThenDive,
	"dash-pause": dashPause,
	flank,
	spiral,
};
```

- [ ] **Step 4: Run to pass** — Step 1 command → PASS.

- [ ] **Step 5: Wire movement into `step.ts`**

Add the import:

```ts
import { makeNoise, MOVEMENTS } from "./movement";
```

Replace the movement + collision loop (currently the `for (const e of s.enemies) { … Math.hypot … }` block that does inline chase) with the behaviour dispatch:

```ts
	// movement + player collision
	for (const e of s.enemies) {
		if (!e.alive) continue;
		const v = MOVEMENTS[e.movement](e, s.tick, makeNoise(e.id));
		e.pos.x += v.x;
		e.pos.y += v.y;
		if (Math.hypot(e.pos.x, e.pos.y) <= ARENA.killRadius) {
			e.alive = false;
			s.playerHp -= 1;
			if (s.targetId === e.id) s.targetId = null;
			if (s.playerHp <= 0) {
				s.playerHp = 0;
				s.status = "gameover";
			}
		}
	}
	if (s.status === "gameover") return s;
```

`getArchetype` is no longer used in the movement loop; it remains imported for the spawn block only. Confirm no unused-import lint error (`getArchetype` is still used at spawn).

- [ ] **Step 6: Run the game suite** — `pnpm test:run -- src/lib/game` → green except golden fixture. Re-record (grunt is `chase`; behaviour is close but the removed overshoot clamp shifts the final frame, so the hash changes — expected). Re-run replay → PASS.

- [ ] **Step 7: Verify checks** — `pnpm typecheck && pnpm lint` → clean.

- [ ] **Step 8: Commit**

```bash
git add src/lib/game/sim/movement.ts src/lib/game/sim/movement.test.ts \
  src/lib/game/sim/step.ts src/lib/game/sim/__fixtures__/replay-first-kill.json
git commit
```

Commit message:

```
feat(game): add data-selected movement behaviour functions

Claude-Session: https://claude.ai/code/session_01N1YqXkNqwh76TbQtmr9DRC
```

---

### Task 4: Wave director + spawner

**Files:**
- Create: `src/lib/game/sim/spawner.ts`
- Create: `src/lib/game/sim/spawner.test.ts`
- Modify: `src/lib/game/sim/state.ts`
- Modify: `src/lib/game/sim/state.test.ts`
- Modify: `src/lib/game/sim/step.ts`
- Modify: `src/lib/game/sim/step.test.ts`

**Interfaces:**
- Consumes: `getArchetype` (`../content/enemies`), `pickWord` (`../content/words`), `createEnemy` (`./enemy-factory`), `nextFloat` (`./rng`), `ARENA`/`GameState`/`Vec2` (`./state`).
- Produces:

```ts
// state.ts (GameState gains these fields)
wave: number;                              // 0 before first wave, 1-based once active
wavePhase: "intermission" | "active";
spawnQueueRemaining: number;               // enemies still to spawn this wave
spawnCooldown: number;                     // ticks until next spawn is allowed
intermissionTicksLeft: number;

// spawner.ts
export const MAX_ALIVE = 8;
export const SPAWN_COOLDOWN_TICKS = 45;
export const INTERMISSION_TICKS = 180;
export const INITIAL_INTERMISSION_TICKS = 60;
export function waveEnemyCount(wave: number): number;
export function selectArchetypeId(
	wave: number,
	rngState: number,
): [id: string, next: number];
export function spawnFromArchetype(s: GameState, archetypeId: string, pos: Vec2): void;
export function runWaveDirector(s: GameState): void; // mutates draft: manages phases + spawns
```

Wave model: the game opens in `intermission` (`intermissionTicksLeft = INITIAL_INTERMISSION_TICKS`, `wave = 0`). When the intermission timer hits 0, the next wave begins (`wave += 1`, `spawnQueueRemaining = waveEnemyCount(wave)`, `wavePhase = "active"`). During `active`, one enemy spawns whenever `spawnCooldown` reaches 0 and alive `< MAX_ALIVE` and the queue is non-empty. When the queue empties and no enemies remain alive, the wave ends and a new intermission begins (`INTERMISSION_TICKS`). `SPAWN_INTERVAL_TICKS` is removed.

- [ ] **Step 1: Add wave fields to `state.ts`**

In `createInitialState`, extend the returned object (append after `enemies: []`, keeping the existing fields):

```ts
export function createInitialState(seed: number): GameState {
	return {
		tick: 0,
		status: "running",
		rngState: createRngState(seed),
		score: 0,
		kills: 0,
		misses: 0,
		playerHp: 3,
		targetId: null,
		nextEnemyId: 1,
		enemies: [],
		wave: 0,
		wavePhase: "intermission",
		spawnQueueRemaining: 0,
		spawnCooldown: 0,
		intermissionTicksLeft: 60,
	};
}
```

And add the fields to the `GameState` type (after `enemies: EnemyState[];`):

```ts
	wave: number;
	wavePhase: "intermission" | "active";
	spawnQueueRemaining: number;
	spawnCooldown: number;
	intermissionTicksLeft: number;
```

- [ ] **Step 2: Update `state.test.ts`**

Replace with:

```ts
import { describe, expect, it } from "vitest";
import { createInitialState } from "./state";

describe("createInitialState", () => {
	it("starts clean and deterministic", () => {
		const s = createInitialState(42);
		expect(s.tick).toBe(0);
		expect(s.status).toBe("running");
		expect(s.playerHp).toBe(3);
		expect(s.enemies).toEqual([]);
		expect(s.targetId).toBeNull();
		expect(s.wave).toBe(0);
		expect(s.wavePhase).toBe("intermission");
		expect(s.intermissionTicksLeft).toBe(60);
		expect(createInitialState(42)).toEqual(s);
	});
});
```

Run: `pnpm test:run -- src/lib/game/sim/state.test.ts` → PASS.

- [ ] **Step 3: Write the spawner test** (`spawner.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { createRngState } from "./rng";
import {
	MAX_ALIVE,
	runWaveDirector,
	selectArchetypeId,
	spawnFromArchetype,
	waveEnemyCount,
} from "./spawner";
import { createInitialState, type GameState } from "./state";

function drive(s: GameState, ticks: number): GameState {
	let cur = s;
	for (let i = 0; i < ticks; i++) {
		cur = { ...cur, tick: cur.tick + 1 };
		runWaveDirector(cur);
	}
	return cur;
}

describe("spawner", () => {
	it("wave enemy count escalates", () => {
		expect(waveEnemyCount(1)).toBeLessThan(waveEnemyCount(5));
		expect(waveEnemyCount(1)).toBeGreaterThan(0);
	});

	it("selectArchetypeId is deterministic and returns a known id", () => {
		const [a] = selectArchetypeId(1, createRngState(3));
		const [b] = selectArchetypeId(1, createRngState(3));
		expect(a).toBe(b);
		expect(a).toBe("grunt");
	});

	it("spawnFromArchetype places one enemy on the spawn radius", () => {
		const s = createInitialState(1);
		spawnFromArchetype(s, "grunt", { x: 20, y: 0 });
		expect(s.enemies.length).toBe(1);
		expect(s.enemies[0].alive).toBe(true);
		expect(s.nextEnemyId).toBe(2);
	});

	it("starts wave 1 after the initial intermission", () => {
		const s = drive(createInitialState(42), 61);
		expect(s.wave).toBe(1);
		expect(s.wavePhase).toBe("active");
	});

	it("spawns up to the wave count and never exceeds MAX_ALIVE", () => {
		const s = drive(createInitialState(42), 60 * 60);
		expect(s.enemies.filter((e) => e.alive).length).toBeLessThanOrEqual(MAX_ALIVE);
		expect(s.enemies.length).toBeGreaterThan(0);
	});
});
```

- [ ] **Step 4: Run to fail** — `pnpm test:run -- src/lib/game/sim/spawner.test.ts` → FAIL.

- [ ] **Step 5: Implement** (`spawner.ts`)

```ts
import { getArchetype } from "../content/enemies";
import { pickWord } from "../content/words";
import { createEnemy } from "./enemy-factory";
import { nextFloat } from "./rng";
import { ARENA, type GameState, type Vec2 } from "./state";

export const MAX_ALIVE = 8;
export const SPAWN_COOLDOWN_TICKS = 45;
export const INTERMISSION_TICKS = 180;
export const INITIAL_INTERMISSION_TICKS = 60;

export function waveEnemyCount(wave: number): number {
	return 3 + wave * 2;
}

/**
 * Pick which archetype to spawn for a wave. Plan 2 ships the interim
 * grunt-only body; Plan 3 (roster) replaces the body with wave-banded
 * weighting over the full table WITHOUT changing this signature.
 */
export function selectArchetypeId(
	wave: number,
	rngState: number,
): [id: string, next: number] {
	const [, next] = nextFloat(rngState);
	return ["grunt", next];
}

export function spawnFromArchetype(
	s: GameState,
	archetypeId: string,
	pos: Vec2,
): void {
	const arch = getArchetype(archetypeId);
	const initials = new Set(
		s.enemies.filter((e) => e.alive).map((e) => e.word[0]),
	);
	const [word, next] = pickWord(s.rngState, initials);
	s.rngState = next;
	const enemy = createEnemy(arch, s.nextEnemyId, pos, s.tick, word);
	s.nextEnemyId += 1;
	s.enemies = [...s.enemies, enemy];
}

export function runWaveDirector(s: GameState): void {
	if (s.spawnCooldown > 0) s.spawnCooldown -= 1;

	if (s.wavePhase === "intermission") {
		if (s.intermissionTicksLeft > 0) {
			s.intermissionTicksLeft -= 1;
			return;
		}
		s.wave += 1;
		s.spawnQueueRemaining = waveEnemyCount(s.wave);
		s.spawnCooldown = 0;
		s.wavePhase = "active";
		return;
	}

	// active
	const aliveCount = s.enemies.filter((e) => e.alive).length;
	if (s.spawnQueueRemaining > 0 && aliveCount < MAX_ALIVE && s.spawnCooldown <= 0) {
		const [angleT, r1] = nextFloat(s.rngState);
		s.rngState = r1;
		const angle = angleT * Math.PI * 2;
		const pos: Vec2 = {
			x: Math.cos(angle) * ARENA.spawnRadius,
			y: Math.sin(angle) * ARENA.spawnRadius,
		};
		const [id, r2] = selectArchetypeId(s.wave, s.rngState);
		s.rngState = r2;
		spawnFromArchetype(s, id, pos);
		s.spawnQueueRemaining -= 1;
		s.spawnCooldown = SPAWN_COOLDOWN_TICKS;
	}

	if (s.spawnQueueRemaining <= 0 && aliveCount === 0) {
		s.wavePhase = "intermission";
		s.intermissionTicksLeft = INTERMISSION_TICKS;
	}
}
```

- [ ] **Step 6: Run to pass** — Step 3 command → PASS.

- [ ] **Step 7: Rewrite the spawn block in `step.ts`**

Update imports: remove `getArchetype`, `pickWord`, `createEnemy`, `nextFloat`, and the `SPAWN_INTERVAL_TICKS`/`MAX_ALIVE` constants from `step.ts`; import from the spawner instead. New import block:

```ts
import { isCharMatch } from "@/lib/core/text/char-match";
import { makeNoise, MOVEMENTS } from "./movement";
import { runWaveDirector } from "./spawner";
import { ARENA, type GameState } from "./state";
```

Remove the `export const SPAWN_INTERVAL_TICKS = 180;` and `export const MAX_ALIVE = 8;` lines from `step.ts` (they now live in `spawner.ts`). Keep `export type GameEvent = { type: "key"; key: string };`.

Replace the entire spawn block (from `// spawn` through the closing brace of the `if (s.tick % SPAWN_INTERVAL_TICKS …)`) with a single call, placed right after the clone:

```ts
	// wave director: intermissions + escalating spawns
	runWaveDirector(s);
```

Leave the movement loop and typing loop as they are.

- [ ] **Step 8: Rewrite `step.test.ts` for the wave model**

```ts
import { describe, expect, it } from "vitest";
import { createInitialState, type GameState } from "./state";
import { type GameEvent, step } from "./step";
import { MAX_ALIVE } from "./spawner";

function run(
	s: GameState,
	ticks: number,
	keysAt: Record<number, string[]> = {},
) {
	let state = s;
	for (let i = 0; i < ticks; i++) {
		const keys = keysAt[state.tick + 1] ?? [];
		state = step(
			state,
			keys.map((k): GameEvent => ({ type: "key", key: k })),
		);
	}
	return state;
}

function advanceToFirstEnemy(seed: number): GameState {
	let s = createInitialState(seed);
	while (s.enemies.filter((e) => e.alive).length === 0 && s.tick < 4000) {
		s = step(s, []);
	}
	return s;
}

describe("step", () => {
	it("opens in an intermission then starts wave 1", () => {
		const s = run(createInitialState(42), 61);
		expect(s.wave).toBe(1);
		expect(s.wavePhase).toBe("active");
	});

	it("spawns enemies once a wave is active", () => {
		const s = advanceToFirstEnemy(42);
		expect(s.enemies.filter((e) => e.alive).length).toBeGreaterThanOrEqual(1);
	});

	it("caps alive enemies at MAX_ALIVE", () => {
		const s = run(createInitialState(42), 60 * 120);
		expect(s.enemies.filter((e) => e.alive).length).toBeLessThanOrEqual(MAX_ALIVE);
	});

	it("enemies move toward the player", () => {
		const a = advanceToFirstEnemy(42);
		const b = step(a, []);
		const ea = a.enemies.find((e) => e.alive);
		const eb = b.enemies.find((e) => e.id === ea?.id);
		if (!ea || !eb) throw new Error("expected a live enemy");
		expect(Math.hypot(eb.pos.x, eb.pos.y)).toBeLessThan(
			Math.hypot(ea.pos.x, ea.pos.y),
		);
	});

	it("typing the full word kills the target", () => {
		let s = advanceToFirstEnemy(42);
		const target = s.enemies.find((e) => e.alive);
		if (!target) throw new Error("expected a live enemy");
		const word = target.word;
		for (const ch of word) {
			s = step(s, [{ type: "key", key: ch }]);
		}
		expect(s.kills).toBe(1);
		expect(s.enemies.find((e) => e.id === target.id)?.alive).toBe(false);
		expect(s.targetId).toBeNull();
		expect(s.score).toBe(10 * word.length);
	});

	it("counts a miss without breaking the lock", () => {
		let s = advanceToFirstEnemy(42);
		const target = s.enemies.find((e) => e.alive);
		if (!target) throw new Error("expected a live enemy");
		s = step(s, [{ type: "key", key: target.word[0] }]);
		const locked = s.targetId;
		s = step(s, [{ type: "key", key: "¤" }]);
		expect(s.misses).toBe(1);
		expect(s.targetId).toBe(locked);
	});

	it("enemies reaching the player eventually end the game", () => {
		const s = run(createInitialState(42), 60 * 60 * 8); // 8 sim minutes untyped
		expect(s.playerHp).toBe(0);
		expect(s.status).toBe("gameover");
	});

	it("is pure — same inputs, same output, no input mutation", () => {
		const s0 = createInitialState(7);
		const frozen = JSON.stringify(s0);
		const a = step(s0, []);
		const b = step(s0, []);
		expect(JSON.stringify(s0)).toBe(frozen);
		expect(a).toEqual(b);
	});
});
```

- [ ] **Step 9: Run the game suite** — `pnpm test:run -- src/lib/game` → green except golden fixture (spawn timing changed). Re-record, re-run replay → PASS.

- [ ] **Step 10: Verify checks** — `pnpm typecheck && pnpm lint` → clean.

- [ ] **Step 11: Commit**

```bash
git add src/lib/game/sim/spawner.ts src/lib/game/sim/spawner.test.ts \
  src/lib/game/sim/state.ts src/lib/game/sim/state.test.ts \
  src/lib/game/sim/step.ts src/lib/game/sim/step.test.ts \
  src/lib/game/sim/__fixtures__/replay-first-kill.json
git commit
```

Commit message:

```
feat(game): add wave director with escalating waves and intermissions

Claude-Session: https://claude.ai/code/session_01N1YqXkNqwh76TbQtmr9DRC
```

---

### Task 5: Multi-hp combat, word reassignment, boss chains + combo scoring

**Files:**
- Create: `src/lib/game/sim/score.ts`
- Create: `src/lib/game/sim/score.test.ts`
- Create: `src/lib/game/sim/combat.ts`
- Create: `src/lib/game/sim/combat.test.ts`
- Modify: `src/lib/game/content/enemies.ts` (add an interim multi-hp `brute` archetype)
- Modify: `src/lib/game/sim/state.ts` (combo fields)
- Modify: `src/lib/game/sim/step.ts` (wire combat + combo decay)

**Interfaces:**
- Consumes: `pickWord` (`../content/words`), `spawnFromArchetype` (`./spawner`), `getArchetype` (`../content/enemies`), `EnemyState`/`GameState` (`./state`).
- Produces:

```ts
// state.ts adds
combo: number;
comboTicksLeft: number;

// score.ts
export const COMBO_DECAY_TICKS = 180;
export function comboMultiplier(combo: number): number; // 1..5
export function killScore(wordLength: number, combo: number): number;

// combat.ts
export function reassignWord(s: GameState, e: EnemyState): void;
export function killEnemy(s: GameState, e: EnemyState): void;
export function resolveCompletion(s: GameState, e: EnemyState): void;
```

A word completion is one point of damage. Multi-hp enemies (regular brutes and bosses alike — a boss is simply an archetype with `hp` 3–5) reassign a fresh word and stay alive until `hp` reaches 0; the "boss word chain" is exactly this reassignment sequence. On kill: `combo` increments, `comboTicksLeft` resets, score is awarded with the combo multiplier, and `split` minions (if any) are emitted. Combo decays to 0 when `comboTicksLeft` elapses or on any miss.

- [ ] **Step 1: Write the score test** (`score.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { comboMultiplier, killScore } from "./score";

describe("score", () => {
	it("multiplier ramps every 5 combo, capped at 5", () => {
		expect(comboMultiplier(0)).toBe(1);
		expect(comboMultiplier(1)).toBe(1);
		expect(comboMultiplier(5)).toBe(2);
		expect(comboMultiplier(10)).toBe(3);
		expect(comboMultiplier(100)).toBe(5);
	});
	it("kill score scales with word length and combo", () => {
		expect(killScore(4, 1)).toBe(40);
		expect(killScore(4, 5)).toBe(80);
	});
});
```

- [ ] **Step 2: Run to fail** — `pnpm test:run -- src/lib/game/sim/score.test.ts` → FAIL.

- [ ] **Step 3: Implement** (`score.ts`)

```ts
export const COMBO_DECAY_TICKS = 180;

export function comboMultiplier(combo: number): number {
	return 1 + Math.min(4, Math.floor(combo / 5));
}

export function killScore(wordLength: number, combo: number): number {
	return 10 * wordLength * comboMultiplier(combo);
}
```

- [ ] **Step 4: Run to pass** — Step 1 command → PASS.

- [ ] **Step 5: Add combo fields to `state.ts`**

Add to the `GameState` type (after `intermissionTicksLeft: number;`):

```ts
	combo: number;
	comboTicksLeft: number;
```

Add to `createInitialState` (after `intermissionTicksLeft: 60,`):

```ts
		combo: 0,
		comboTicksLeft: 0,
```

- [ ] **Step 6: Add the interim `brute` archetype to `enemies.ts`**

Append to the `ENEMIES` array (after the `grunt` entry) so multi-hp is exercisable via `step`. Plan 3 replaces the whole table; this interim entry is only for Plan 2 tests.

```ts
	{
		id: "brute",
		name: "Brute",
		hp: 3,
		speed: 0.03,
		size: 1.4,
		tier: 3,
		movement: "chase",
		ability: null,
		role: "regular",
	},
```

- [ ] **Step 7: Write the combat test** (`combat.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { getArchetype } from "../content/enemies";
import { killEnemy, reassignWord, resolveCompletion } from "./combat";
import { createEnemy } from "./enemy-factory";
import { createInitialState, type GameState } from "./state";

function stateWithEnemy(archetypeId: string): {
	s: GameState;
	enemyId: number;
} {
	const s = createInitialState(42);
	const enemy = createEnemy(
		getArchetype(archetypeId),
		s.nextEnemyId,
		{ x: 5, y: 0 },
		0,
		getArchetype(archetypeId).hp > 1 ? "brutes" : "the",
	);
	s.nextEnemyId += 1;
	s.enemies = [enemy];
	s.targetId = enemy.id;
	return { s, enemyId: enemy.id };
}

describe("combat", () => {
	it("reassignWord swaps the word and resets typedCount but keeps the lock", () => {
		const { s, enemyId } = stateWithEnemy("grunt");
		const e = s.enemies[0];
		e.typedCount = 2;
		const before = e.word;
		reassignWord(s, e);
		expect(e.typedCount).toBe(0);
		expect(typeof e.word).toBe("string");
		expect(s.targetId).toBe(enemyId);
		expect(e.word.length).toBeGreaterThan(0);
		void before;
	});

	it("killEnemy awards combo-scaled score and clears the lock", () => {
		const { s } = stateWithEnemy("grunt");
		const e = s.enemies[0];
		killEnemy(s, e);
		expect(e.alive).toBe(false);
		expect(s.kills).toBe(1);
		expect(s.combo).toBe(1);
		expect(s.comboTicksLeft).toBeGreaterThan(0);
		expect(s.score).toBe(10 * e.word.length);
		expect(s.targetId).toBeNull();
	});

	it("a 3-hp brute takes three completions to die, reassigning each time", () => {
		const { s } = stateWithEnemy("brute");
		const e = s.enemies[0];
		// resolveCompletion acts only when the word is complete; simulate that.
		e.typedCount = e.word.length;
		resolveCompletion(s, e);
		expect(e.alive).toBe(true);
		expect(e.hp).toBe(2);
		e.typedCount = e.word.length; // word was reassigned; complete it again
		resolveCompletion(s, e);
		expect(e.hp).toBe(1);
		e.typedCount = e.word.length;
		resolveCompletion(s, e);
		expect(e.alive).toBe(false);
		expect(s.kills).toBe(1);
	});
});
```

- [ ] **Step 8: Run to fail** — `pnpm test:run -- src/lib/game/sim/combat.test.ts` → FAIL.

- [ ] **Step 9: Implement** (`combat.ts`)

```ts
import { pickWord } from "../content/words";
import { COMBO_DECAY_TICKS, killScore } from "./score";
import { spawnFromArchetype } from "./spawner";
import { type EnemyState, type GameState } from "./state";

/** Shield / armored-front damage absorption. Extended in Task 6 (abilities);
 * Plan 2 base rule: nothing is absorbed. */
function absorbsCompletion(_s: GameState, _e: EnemyState): boolean {
	return false;
}

export function reassignWord(s: GameState, e: EnemyState): void {
	const initials = new Set(
		s.enemies.filter((x) => x.alive && x.id !== e.id).map((x) => x.word[0]),
	);
	const [word, next] = pickWord(s.rngState, initials);
	s.rngState = next;
	e.word = word;
	e.typedCount = 0;
}

export function killEnemy(s: GameState, e: EnemyState): void {
	e.alive = false;
	s.kills += 1;
	s.combo += 1;
	s.comboTicksLeft = COMBO_DECAY_TICKS;
	s.score += killScore(e.word.length, s.combo);
	if (s.targetId === e.id) s.targetId = null;
	if (e.ability?.kind === "split") {
		const { n, minion } = e.ability;
		for (let i = 0; i < n; i++) {
			const angle = (i / n) * Math.PI * 2;
			spawnFromArchetype(s, minion, {
				x: e.pos.x + Math.cos(angle),
				y: e.pos.y + Math.sin(angle),
			});
		}
	}
}

export function resolveCompletion(s: GameState, e: EnemyState): void {
	// Called after every keystroke on the target; act only when the word is done.
	if (e.typedCount < e.word.length) return;
	if (absorbsCompletion(s, e)) {
		s.score += 10 * e.word.length;
		reassignWord(s, e);
		return;
	}
	e.hp -= 1;
	if (e.hp <= 0) {
		killEnemy(s, e);
		return;
	}
	// multi-hp / boss chain: damaged but alive → chip score + next word
	s.score += 10 * e.word.length;
	reassignWord(s, e);
}
```

- [ ] **Step 10: Run to pass** — Step 7 command → PASS.

- [ ] **Step 11: Wire combat + combo decay into `step.ts`**

Add imports:

```ts
import { resolveCompletion } from "./combat";
```

Delete the local `finishIfComplete` function at the bottom of `step.ts`. Replace both `finishIfComplete(s, picked)` and `finishIfComplete(s, target)` calls with `resolveCompletion(s, picked)` and `resolveCompletion(s, target)`. In the typing loop, on a mismatch (the `else { s.misses += 1; }` branch and the no-candidate branch), also break the combo:

```ts
			} else {
				s.misses += 1;
				s.combo = 0;
				s.comboTicksLeft = 0;
			}
```

and in the no-target no-candidate branch:

```ts
			if (candidates.length === 0) {
				s.misses += 1;
				s.combo = 0;
				s.comboTicksLeft = 0;
				continue;
			}
```

Add combo decay right before the typing loop (after the movement/collision block and its `if (s.status === "gameover") return s;`):

```ts
	// combo decay
	if (s.comboTicksLeft > 0) {
		s.comboTicksLeft -= 1;
		if (s.comboTicksLeft === 0) s.combo = 0;
	}
```

- [ ] **Step 12: Run the game suite** — `pnpm test:run -- src/lib/game` → green except golden fixture. Re-record, re-run replay → PASS.

- [ ] **Step 13: Verify checks** — `pnpm typecheck && pnpm lint` → clean.

- [ ] **Step 14: Commit**

```bash
git add src/lib/game/sim/score.ts src/lib/game/sim/score.test.ts \
  src/lib/game/sim/combat.ts src/lib/game/sim/combat.test.ts \
  src/lib/game/content/enemies.ts src/lib/game/sim/state.ts \
  src/lib/game/sim/step.ts src/lib/game/sim/__fixtures__/replay-first-kill.json
git commit
```

Commit message:

```
feat(game): add multi-hp combat, word chains and combo-scaled scoring

Claude-Session: https://claude.ai/code/session_01N1YqXkNqwh76TbQtmr9DRC
```

---

### Task 6: Enemy abilities

**Files:**
- Create: `src/lib/game/sim/abilities.ts`
- Create: `src/lib/game/sim/abilities.test.ts`
- Modify: `src/lib/game/sim/combat.ts` (use real absorption)
- Modify: `src/lib/game/sim/step.ts` (ability tick phase + targetable gating)

**Interfaces:**
- Consumes: `spawnFromArchetype` (`./spawner`), `EnemyState`/`GameState` (`./state`).
- Produces:

```ts
// abilities.ts
export const CLOAK_MIN_DIST = 6;
export function isTargetable(e: EnemyState, tick: number): boolean; // cloak gate for ACQUISITION
export function absorbsCompletion(e: EnemyState): boolean;          // shield / armored-front
export function tickAbility(s: GameState, e: EnemyState): void;     // spawn/heal/teleport/enrage
```

Ability state is minimal: only `shieldHits` (mutable) and `enraged` (latch) are stored; cloak visibility, spawn cadence, heal pulse, and teleport blink are all derived purely from `tick - spawnTick`, so they need no stored counters. `absorbsCompletion` handles shield (consumes `shieldHits`) and armored-front (absorbs while `dist > exposeRadius`). `isTargetable` gates only *new* target acquisition (an in-progress lock is never lost to a cloak flicker).

- [ ] **Step 1: Write the abilities test** (`abilities.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import type { Ability } from "../content/enemies";
import { absorbsCompletion, isTargetable, tickAbility } from "./abilities";
import { createInitialState, type EnemyState, type GameState } from "./state";

function enemyWith(ability: Ability | null, over: Partial<EnemyState> = {}): EnemyState {
	return {
		id: 1,
		archetypeId: "x",
		pos: { x: 8, y: 0 },
		word: "the",
		typedCount: 0,
		hp: 4,
		maxHp: 4,
		alive: true,
		spawnTick: 0,
		speed: 0.03,
		tier: 2,
		movement: "chase",
		ability,
		abilityState: {
			shieldHits: ability?.kind === "shield" ? ability.hits : 0,
			enraged: false,
		},
		...over,
	};
}

describe("abilities", () => {
	it("shield absorbs completions until hits are spent", () => {
		const e = enemyWith({ kind: "shield", hits: 2 });
		expect(absorbsCompletion(e)).toBe(true);
		expect(e.abilityState.shieldHits).toBe(1);
		expect(absorbsCompletion(e)).toBe(true);
		expect(e.abilityState.shieldHits).toBe(0);
		expect(absorbsCompletion(e)).toBe(false);
	});

	it("armored-front absorbs while far, exposes when close", () => {
		const far = enemyWith({ kind: "armored-front", exposeRadius: 4 }, { pos: { x: 8, y: 0 } });
		const near = enemyWith({ kind: "armored-front", exposeRadius: 4 }, { pos: { x: 2, y: 0 } });
		expect(absorbsCompletion(far)).toBe(true);
		expect(absorbsCompletion(near)).toBe(false);
	});

	it("cloak toggles targetability on its interval", () => {
		const e = enemyWith({ kind: "cloak", interval: 30 });
		expect(isTargetable(e, 0)).toBe(true);
		expect(isTargetable(e, 30)).toBe(false);
		expect(isTargetable(e, 60)).toBe(true);
	});

	it("non-cloak enemies are always targetable", () => {
		expect(isTargetable(enemyWith(null), 30)).toBe(true);
	});

	it("enrage-at-half latches a one-time speed boost", () => {
		const s = createInitialState(1);
		const e = enemyWith({ kind: "enrage-at-half", speedMult: 2 }, { hp: 2, maxHp: 4, speed: 0.03 });
		s.enemies = [e];
		tickAbility(s, e);
		expect(e.abilityState.enraged).toBe(true);
		expect(e.speed).toBeCloseTo(0.06, 6);
		tickAbility(s, e); // does not stack
		expect(e.speed).toBeCloseTo(0.06, 6);
	});

	it("spawn emits a minion on its cadence", () => {
		const s = createInitialState(1);
		const e = enemyWith({ kind: "spawn", minion: "grunt", rate: 20 }, { spawnTick: 0 });
		s.enemies = [e];
		s.tick = 20;
		tickAbility(s, e);
		expect(s.enemies.filter((x) => x.archetypeId === "grunt").length).toBe(1);
	});

	it("teleport blinks the enemy inward on its cadence", () => {
		const s = createInitialState(1);
		const e = enemyWith({ kind: "teleport", interval: 20, range: 3 }, { pos: { x: 10, y: 0 } });
		s.enemies = [e];
		s.tick = 20;
		const before = Math.hypot(e.pos.x, e.pos.y);
		tickAbility(s, e);
		expect(Math.hypot(e.pos.x, e.pos.y)).toBeLessThan(before);
	});

	it("heal-aura restores nearby wounded allies on its pulse", () => {
		const s = createInitialState(1);
		const healer = enemyWith({ kind: "heal-aura", radius: 5, amount: 1, interval: 20 }, { id: 1, pos: { x: 0, y: 0 } });
		const ally = enemyWith(null, { id: 2, pos: { x: 2, y: 0 }, hp: 1, maxHp: 4 });
		s.enemies = [healer, ally];
		s.tick = 20;
		tickAbility(s, healer);
		expect(s.enemies.find((x) => x.id === 2)?.hp).toBe(2);
	});
});
```

- [ ] **Step 2: Run to fail** — `pnpm test:run -- src/lib/game/sim/abilities.test.ts` → FAIL.

- [ ] **Step 3: Implement** (`abilities.ts`)

```ts
import { spawnFromArchetype } from "./spawner";
import { type EnemyState, type GameState } from "./state";

/** Cloak gates only NEW target acquisition, never an in-progress lock. */
export function isTargetable(e: EnemyState, tick: number): boolean {
	if (e.ability?.kind !== "cloak") return true;
	const period = e.ability.interval * 2;
	return (tick - e.spawnTick) % period < e.ability.interval;
}

/** Shield consumes a hit; armored-front absorbs while the plated side faces
 * the player (dist > exposeRadius). Returns true when this completion deals
 * no hp damage. */
export function absorbsCompletion(e: EnemyState): boolean {
	if (e.ability?.kind === "shield") {
		if (e.abilityState.shieldHits > 0) {
			e.abilityState.shieldHits -= 1;
			return true;
		}
		return false;
	}
	if (e.ability?.kind === "armored-front") {
		return Math.hypot(e.pos.x, e.pos.y) > e.ability.exposeRadius;
	}
	return false;
}

export function tickAbility(s: GameState, e: EnemyState): void {
	const ability = e.ability;
	if (!ability) return;
	const age = s.tick - e.spawnTick;

	switch (ability.kind) {
		case "enrage-at-half": {
			if (!e.abilityState.enraged && e.hp <= e.maxHp / 2) {
				e.abilityState.enraged = true;
				e.speed *= ability.speedMult;
			}
			return;
		}
		case "spawn": {
			if (age > 0 && age % ability.rate === 0) {
				const angle = (age * 0.618) % (Math.PI * 2);
				spawnFromArchetype(s, ability.minion, {
					x: e.pos.x + Math.cos(angle),
					y: e.pos.y + Math.sin(angle),
				});
			}
			return;
		}
		case "teleport": {
			if (age > 0 && age % ability.interval === 0) {
				const d = Math.hypot(e.pos.x, e.pos.y) || 1;
				const jump = Math.min(ability.range, d);
				e.pos.x -= (e.pos.x / d) * jump;
				e.pos.y -= (e.pos.y / d) * jump;
			}
			return;
		}
		case "heal-aura": {
			if (age > 0 && age % ability.interval === 0) {
				for (const ally of s.enemies) {
					if (!ally.alive || ally.id === e.id) continue;
					const dx = ally.pos.x - e.pos.x;
					const dy = ally.pos.y - e.pos.y;
					if (Math.hypot(dx, dy) <= ability.radius) {
						ally.hp = Math.min(ally.maxHp, ally.hp + ability.amount);
					}
				}
			}
			return;
		}
		default:
			// split (handled on death), shield / cloak / armored-front (handled
			// at completion / acquisition time) need no per-tick work.
			return;
	}
}
```

- [ ] **Step 4: Run to pass** — Step 1 command → PASS.

- [ ] **Step 5: Use real absorption in `combat.ts`**

In `combat.ts`, delete the local `absorbsCompletion` stub and import the real one:

```ts
import { absorbsCompletion } from "./abilities";
```

Update `resolveCompletion` to call it with just the enemy (keeping the completion guard):

```ts
export function resolveCompletion(s: GameState, e: EnemyState): void {
	if (e.typedCount < e.word.length) return;
	if (absorbsCompletion(e)) {
		s.score += 10 * e.word.length;
		reassignWord(s, e);
		return;
	}
	e.hp -= 1;
	if (e.hp <= 0) {
		killEnemy(s, e);
		return;
	}
	s.score += 10 * e.word.length;
	reassignWord(s, e);
}
```

- [ ] **Step 6: Wire ability tick + targetable gating into `step.ts`**

Add imports:

```ts
import { isTargetable, tickAbility } from "./abilities";
```

Add the ability tick phase immediately after `runWaveDirector(s);` and before the movement loop:

```ts
	// abilities (spawn / heal / teleport / enrage) — O(enemies)
	for (const e of s.enemies) {
		if (e.alive && e.ability) tickAbility(s, e);
	}
```

In the typing loop's acquisition branch (the `candidates` filter), gate on `isTargetable`:

```ts
			const candidates = s.enemies
				.filter(
					(e) =>
						e.alive &&
						isTargetable(e, s.tick) &&
						isCharMatch(ev.key, e.word[0]),
				)
				.sort(
					(a, b) =>
						Math.hypot(a.pos.x, a.pos.y) - Math.hypot(b.pos.x, b.pos.y),
				);
```

Leave the in-progress lock advance untouched (a locked cloaked enemy stays typeable).

- [ ] **Step 7: Run the game suite** — `pnpm test:run -- src/lib/game` → green except golden fixture. Re-record, re-run replay → PASS.

- [ ] **Step 8: Verify checks** — `pnpm typecheck && pnpm lint` → clean.

- [ ] **Step 9: Commit**

```bash
git add src/lib/game/sim/abilities.ts src/lib/game/sim/abilities.test.ts \
  src/lib/game/sim/combat.ts src/lib/game/sim/step.ts \
  src/lib/game/sim/__fixtures__/replay-first-kill.json
git commit
```

Commit message:

```
feat(game): add minimal-state enemy abilities selected by data

Claude-Session: https://claude.ai/code/session_01N1YqXkNqwh76TbQtmr9DRC
```

---

### Task 7: Word-labelled powerups

**Files:**
- Create: `src/lib/game/sim/powerups.ts`
- Create: `src/lib/game/sim/powerups.test.ts`
- Modify: `src/lib/game/sim/state.ts` (powerup + effect fields)
- Modify: `src/lib/game/sim/step.ts` (spawn, lifetime, movement scaling, powerup typing)

**Interfaces:**
- Consumes: `pickWord` (`../content/words`), `nextFloat`/`nextInt` (`./rng`), `ARENA`/`GameState` (`./state`); `isCharMatch` (`@/lib/core/text/char-match`).
- Produces:

```ts
// state.ts adds
maxPlayerHp: number;
freezeTicksLeft: number;
slowTicksLeft: number;
targetPowerupId: number | null;
powerups: PowerupPickup[];
nextPowerupId: number;

export type PowerupKind = "freeze" | "bomb" | "heal" | "slow";
export type PowerupPickup = {
	id: number;
	kind: PowerupKind;
	word: string;
	typedCount: number;
	pos: Vec2;
	expiresTick: number;
};

// powerups.ts
export const POWERUP_LIFETIME_TICKS = 600;
export const FREEZE_TICKS = 180;
export const SLOW_TICKS = 300;
export const SLOW_FACTOR = 0.5;
export const POWERUP_SPAWN_EVERY_KILLS = 12;
export const POWERUP_WORDS: readonly string[];
export function spawnPowerup(s: GameState): void;
export function applyPowerup(s: GameState, kind: PowerupKind): void;
```

Powerups are typed exactly like enemies but tracked in a parallel `powerups[]` list with their own lock (`targetPowerupId`). Acquisition prefers enemies; a key that matches no enemy initial but matches a powerup initial locks the powerup. Completing a powerup word applies its effect and removes the pickup. `freeze` stops movement (`scale = 0`); `slow` halves it (`SLOW_FACTOR`); `bomb` kills every alive enemy; `heal` restores 1 hp capped at `maxPlayerHp`.

- [ ] **Step 1: Add powerup fields to `state.ts`**

Add the types near `EnemyState`:

```ts
export type PowerupKind = "freeze" | "bomb" | "heal" | "slow";
export type PowerupPickup = {
	id: number;
	kind: PowerupKind;
	word: string;
	typedCount: number;
	pos: Vec2;
	expiresTick: number;
};
```

Add to the `GameState` type (after `comboTicksLeft: number;`):

```ts
	maxPlayerHp: number;
	freezeTicksLeft: number;
	slowTicksLeft: number;
	targetPowerupId: number | null;
	powerups: PowerupPickup[];
	nextPowerupId: number;
```

Add to `createInitialState` (after `comboTicksLeft: 0,`):

```ts
		maxPlayerHp: 3,
		freezeTicksLeft: 0,
		slowTicksLeft: 0,
		targetPowerupId: null,
		powerups: [],
		nextPowerupId: 1,
```

- [ ] **Step 2: Write the powerups test** (`powerups.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { getArchetype } from "../content/enemies";
import { createEnemy } from "./enemy-factory";
import {
	applyPowerup,
	FREEZE_TICKS,
	SLOW_TICKS,
	spawnPowerup,
} from "./powerups";
import { createInitialState } from "./state";

describe("powerups", () => {
	it("spawnPowerup adds one word-labelled pickup deterministically", () => {
		const a = createInitialState(9);
		const b = createInitialState(9);
		spawnPowerup(a);
		spawnPowerup(b);
		expect(a.powerups.length).toBe(1);
		expect(a.powerups[0].word.length).toBeGreaterThan(0);
		expect(a.powerups[0]).toEqual(b.powerups[0]);
		expect(a.nextPowerupId).toBe(2);
	});

	it("freeze sets the freeze timer", () => {
		const s = createInitialState(1);
		applyPowerup(s, "freeze");
		expect(s.freezeTicksLeft).toBe(FREEZE_TICKS);
	});

	it("slow sets the slow timer", () => {
		const s = createInitialState(1);
		applyPowerup(s, "slow");
		expect(s.slowTicksLeft).toBe(SLOW_TICKS);
	});

	it("heal restores one hp capped at maxPlayerHp", () => {
		const s = createInitialState(1);
		s.playerHp = 1;
		applyPowerup(s, "heal");
		expect(s.playerHp).toBe(2);
		s.playerHp = 3;
		applyPowerup(s, "heal");
		expect(s.playerHp).toBe(3);
	});

	it("bomb kills every alive enemy", () => {
		const s = createInitialState(1);
		s.enemies = [
			createEnemy(getArchetype("grunt"), 1, { x: 5, y: 0 }, 0, "the"),
			createEnemy(getArchetype("grunt"), 2, { x: -5, y: 0 }, 0, "and"),
		];
		s.nextEnemyId = 3;
		applyPowerup(s, "bomb");
		expect(s.enemies.every((e) => !e.alive)).toBe(true);
	});
});
```

- [ ] **Step 3: Run to fail** — `pnpm test:run -- src/lib/game/sim/powerups.test.ts` → FAIL.

- [ ] **Step 4: Implement** (`powerups.ts`)

```ts
import { pickWord } from "../content/words";
import { nextFloat, nextInt } from "./rng";
import { ARENA, type GameState, type PowerupKind } from "./state";

export const POWERUP_LIFETIME_TICKS = 600;
export const FREEZE_TICKS = 180;
export const SLOW_TICKS = 300;
export const SLOW_FACTOR = 0.5;
export const POWERUP_SPAWN_EVERY_KILLS = 12;

const KINDS: readonly PowerupKind[] = ["freeze", "bomb", "heal", "slow"];
export const POWERUP_WORDS: readonly string[] = [
	"nova",
	"pulse",
	"surge",
	"blitz",
	"volt",
	"flux",
];

export function spawnPowerup(s: GameState): void {
	const [ki, r1] = nextInt(s.rngState, KINDS.length);
	const [wi, r2] = nextInt(r1, POWERUP_WORDS.length);
	const initials = new Set(s.enemies.filter((e) => e.alive).map((e) => e.word[0]));
	// keep powerup words visually distinct from POWERUP_WORDS pool; fall back to
	// pickWord only if a bank word collides with a live enemy initial
	let word = POWERUP_WORDS[wi];
	let r3 = r2;
	if (initials.has(word[0])) {
		const [w, next] = pickWord(r2, initials);
		word = w;
		r3 = next;
	}
	const [angleT, r4] = nextFloat(r3);
	s.rngState = r4;
	const angle = angleT * Math.PI * 2;
	const radius = ARENA.spawnRadius * 0.5;
	s.powerups = [
		...s.powerups,
		{
			id: s.nextPowerupId,
			kind: KINDS[ki],
			word,
			typedCount: 0,
			pos: { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius },
			expiresTick: s.tick + POWERUP_LIFETIME_TICKS,
		},
	];
	s.nextPowerupId += 1;
}

export function applyPowerup(s: GameState, kind: PowerupKind): void {
	switch (kind) {
		case "freeze":
			s.freezeTicksLeft = FREEZE_TICKS;
			return;
		case "slow":
			s.slowTicksLeft = SLOW_TICKS;
			return;
		case "heal":
			s.playerHp = Math.min(s.maxPlayerHp, s.playerHp + 1);
			return;
		case "bomb":
			for (const e of s.enemies) {
				if (e.alive) e.alive = false;
			}
			return;
	}
}
```

- [ ] **Step 5: Run to pass** — Step 2 command → PASS.

- [ ] **Step 6: Wire powerups into `step.ts`**

Add imports:

```ts
import {
	applyPowerup,
	POWERUP_SPAWN_EVERY_KILLS,
	SLOW_FACTOR,
	spawnPowerup,
} from "./powerups";
```

Update the working-draft clone to deep-copy `powerups`:

```ts
	const s: GameState = {
		...state,
		tick: state.tick + 1,
		enemies: state.enemies.map((e) => ({
			...e,
			pos: { ...e.pos },
			abilityState: { ...e.abilityState },
		})),
		powerups: state.powerups.map((p) => ({ ...p, pos: { ...p.pos } })),
	};
```

Add freeze/slow scaling to the movement loop:

```ts
	// movement + player collision
	let moveScale = 1;
	if (s.freezeTicksLeft > 0) moveScale = 0;
	else if (s.slowTicksLeft > 0) moveScale = SLOW_FACTOR;
	for (const e of s.enemies) {
		if (!e.alive) continue;
		const v = MOVEMENTS[e.movement](e, s.tick, makeNoise(e.id));
		e.pos.x += v.x * moveScale;
		e.pos.y += v.y * moveScale;
		if (Math.hypot(e.pos.x, e.pos.y) <= ARENA.killRadius) {
			e.alive = false;
			s.playerHp -= 1;
			if (s.targetId === e.id) s.targetId = null;
			if (s.playerHp <= 0) {
				s.playerHp = 0;
				s.status = "gameover";
			}
		}
	}
	if (s.status === "gameover") return s;
```

Add effect-timer decay + powerup lifetime + milestone spawn, placed right after the combo-decay block and before the typing loop:

```ts
	// effect timers
	if (s.freezeTicksLeft > 0) s.freezeTicksLeft -= 1;
	if (s.slowTicksLeft > 0) s.slowTicksLeft -= 1;

	// powerup lifetime + kill-milestone spawn
	if (s.powerups.length > 0) {
		s.powerups = s.powerups.filter((p) => p.expiresTick > s.tick);
		if (s.targetPowerupId !== null && !s.powerups.some((p) => p.id === s.targetPowerupId)) {
			s.targetPowerupId = null;
		}
	}
	if (s.kills > 0 && s.kills % POWERUP_SPAWN_EVERY_KILLS === 0 && s.powerups.length === 0) {
		spawnPowerup(s);
	}
```

Extend the typing loop to handle powerup locks and acquisition. Replace the whole `for (const ev of events)` body with:

```ts
	for (const ev of events) {
		if (ev.type !== "key") continue;

		// 1) advance a locked powerup
		if (s.targetPowerupId !== null) {
			const pu = s.powerups.find((p) => p.id === s.targetPowerupId);
			if (pu && isCharMatch(ev.key, pu.word[pu.typedCount])) {
				pu.typedCount += 1;
				if (pu.typedCount >= pu.word.length) {
					applyPowerup(s, pu.kind);
					s.powerups = s.powerups.filter((p) => p.id !== pu.id);
					s.targetPowerupId = null;
				}
				continue;
			}
			if (pu) {
				s.misses += 1;
				s.combo = 0;
				s.comboTicksLeft = 0;
				continue;
			}
			s.targetPowerupId = null;
		}

		// 2) advance a locked enemy
		const target = s.enemies.find((e) => e.id === s.targetId && e.alive);
		if (target) {
			if (isCharMatch(ev.key, target.word[target.typedCount])) {
				target.typedCount += 1;
				resolveCompletion(s, target);
			} else {
				s.misses += 1;
				s.combo = 0;
				s.comboTicksLeft = 0;
			}
			continue;
		}
		s.targetId = null;

		// 3) acquire a new enemy target (preferred), then a powerup
		const candidates = s.enemies
			.filter(
				(e) =>
					e.alive && isTargetable(e, s.tick) && isCharMatch(ev.key, e.word[0]),
			)
			.sort(
				(a, b) => Math.hypot(a.pos.x, a.pos.y) - Math.hypot(b.pos.x, b.pos.y),
			);
		if (candidates.length > 0) {
			const picked = candidates[0];
			picked.typedCount = 1;
			s.targetId = picked.id;
			resolveCompletion(s, picked);
			continue;
		}

		const pu = s.powerups.find((p) => isCharMatch(ev.key, p.word[0]));
		if (pu) {
			pu.typedCount = 1;
			s.targetPowerupId = pu.id;
			if (pu.word.length === 1) {
				applyPowerup(s, pu.kind);
				s.powerups = s.powerups.filter((p) => p.id !== pu.id);
				s.targetPowerupId = null;
			}
			continue;
		}

		s.misses += 1;
		s.combo = 0;
		s.comboTicksLeft = 0;
	}
```

Note: `resolveCompletion` on a fresh single-char acquisition advances `typedCount` to 1; for a 1-char word it completes immediately, matching prior behaviour.

- [ ] **Step 7: Run the game suite** — `pnpm test:run -- src/lib/game` → green except golden fixture. Re-record, re-run replay → PASS.

- [ ] **Step 8: Verify checks** — `pnpm typecheck && pnpm lint` → clean.

- [ ] **Step 9: Commit**

```bash
git add src/lib/game/sim/powerups.ts src/lib/game/sim/powerups.test.ts \
  src/lib/game/sim/state.ts src/lib/game/sim/step.ts \
  src/lib/game/sim/__fixtures__/replay-first-kill.json
git commit
```

Commit message:

```
feat(game): add word-labelled powerups with freeze, slow, bomb and heal

Claude-Session: https://claude.ai/code/session_01N1YqXkNqwh76TbQtmr9DRC
```

---

### Task 8: Comprehensive determinism fixture + verification

**Files:**
- Create: `src/lib/game/sim/__fixtures__/replay-deep-run.json`
- Modify: `src/lib/game/sim/replay.test.ts`

**Interfaces:**
- Consumes: `runReplay`, `stateHash` (`./replay`), `createInitialState`, `step` (`./state`, `./step`).
- Produces: a second golden fixture that exercises multiple waves, multi-hp kills, combo scoring, and (incidentally) abilities/powerups over a long untyped-plus-scripted run.

- [ ] **Step 1: Add the deep-run recorder + assert to `replay.test.ts`**

Append a second scenario builder and two tests. Add near `buildFirstKillLog`:

```ts
/**
 * A long deterministic run: play several waves, scripting a burst of the most
 * common letters each tick so combos, multi-hp reassignment and powerup typing
 * all fire. Purely to lock the sim's byte-for-byte determinism.
 */
function buildDeepRunLog(seed: number): InputLog {
	const letters = "etaoinshrdlucmfwypvbgkjqxz";
	const events: { tick: number; key: string }[] = [];
	for (let tick = 1; tick <= 2400; tick++) {
		const key = letters[tick % letters.length];
		events.push({ tick, key });
	}
	return { seed, ticks: 2400, events };
}
```

Add the tests inside the `describe("replay", …)` block:

```ts
	it("deep run is deterministic across replays", () => {
		const log = buildDeepRunLog(42);
		expect(stateHash(runReplay(log))).toBe(stateHash(runReplay(log)));
	});

	it("matches the deep-run golden fixture", async () => {
		const fixture = await import("./__fixtures__/replay-deep-run.json");
		const result = runReplay(fixture.log as InputLog);
		expect(stateHash(result)).toBe(fixture.expectedHash);
		expect(result.wave).toBe(fixture.expectedWave);
	});
```

Extend the `[record]` recorder to also write the deep-run fixture:

```ts
	it("[record] regenerate deep-run fixture", () => {
		if (!process.env.RECORD_FIXTURE) return;
		const log = buildDeepRunLog(42);
		const result = runReplay(log);
		const fixture = {
			log,
			expectedHash: stateHash(result),
			expectedWave: result.wave,
		};
		writeFileSync(
			new URL("./__fixtures__/replay-deep-run.json", import.meta.url),
			`${JSON.stringify(fixture, null, "\t")}\n`,
		);
	});
```

- [ ] **Step 2: Record both fixtures**

Run: `RECORD_FIXTURE=1 pnpm test:run -- src/lib/game/sim/replay.test.ts`
Expected: PASS; `replay-deep-run.json` created, `replay-first-kill.json` unchanged (no sim change since Task 7).

- [ ] **Step 3: Verify the guard** — `pnpm test:run -- src/lib/game/sim/replay.test.ts` → PASS.

- [ ] **Step 4: Full suite + checks**

Run: `pnpm typecheck && pnpm lint && pnpm test:run`
Expected: all green.

- [ ] **Step 5: Commit + push**

```bash
git add src/lib/game/sim/replay.test.ts src/lib/game/sim/__fixtures__/replay-deep-run.json
git commit
git push
```

Commit message:

```
test(game): add deep-run determinism fixture across waves and combat

Claude-Session: https://claude.ai/code/session_01N1YqXkNqwh76TbQtmr9DRC
```

- [ ] **Step 6: Watch CI green** — `gh run watch <id> --exit-status`.

---

## After this plan

Run `/code-review` on the sim-depth diff (major junction 2). Then execute Plan 3
(`docs/superpowers/plans/2026-07-11-horde-roster.md`): the 30+ enemy roster, per-tier
word bands, roster validation, and wave-banded spawner weighting — which swaps the
interim `selectArchetypeId` body and `pickWord` reassignment for the full roster and
banded pickers defined here.

## Self-Review Notes

- **Spec coverage (§5–§6):** wave director (Task 4), six movement behaviours (Task 3),
  eight abilities (Task 6), multi-hp + word reassignment + boss chains (Task 5),
  combo/multiplier scoring with decay (Task 5), powerups freeze/bomb/heal/slow (Task 7),
  determinism preserved via re-recorded golden fixtures every task + a deep-run fixture
  (Task 8). Word-assignment banding + full roster are deferred to Plan 3 (spec §5–§6
  breadth), consistent with the delivery plan §11.
- **`step()` sole mutator:** every helper (`runWaveDirector`, `tickAbility`,
  `resolveCompletion`, `killEnemy`, `reassignWord`, `applyPowerup`, `spawnPowerup`,
  `spawnFromArchetype`) mutates only the working draft `s` created inside `step`; none is
  called elsewhere in the sim. Purity test in `step.test.ts` guards this.
- **O(enemies), no trig-heavy allocations:** movement/ability loops do zero `Map`
  lookups (archetype fields denormalised at spawn); each movement fn allocates one
  `Vec2` and calls ≤2 trig fns; noise is a pure integer hash.
- **Type consistency:** `MovementId`, `Ability`, `AbilityState`, `EnemyState`,
  `GameState`, `PowerupPickup`, `spawnFromArchetype`, `selectArchetypeId`,
  `pickWord`/(Plan 3 `pickWordForTier`) signatures are defined once and reused verbatim;
  `selectArchetypeId(wave, rngState) → [id, next]` and `pickWord(rngState, excludeInitials)
  → [word, next]` match the shapes Plan 3 extends.
