# Horde Mode Walking Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** End-to-end tracer bullet for the Horde typing game: `/game` route loads a lazy Babylon scene, one enemy type spawns and chases, typing its word kills it, player death ends the run — with deterministic sim, replay hash test, E2E probe, and visual snapshot.

**Architecture:** Pure TS fixed-timestep sim in `src/lib/game/sim` (no Babylon/DOM), data in `src/lib/game/content`, Babylon adapter in `src/lib/game/render` (deep tree-shaken imports, loaded only via lazy `/game` route), Solid shell in `src/components/game`. Test hooks: `?seed=&testMode=1` exposes `window.__game`.

**Tech Stack:** SolidJS 1.9, Vite 8, @babylonjs/core 9.x (new dep), Vitest 4, Playwright 1.61.

## Global Constraints

- `src/lib/game/sim/**` and `src/lib/game/content/**` MUST NOT import Babylon, Solid, or touch DOM/`Date.now`/`Math.random`. All randomness via `rng.ts`; time = tick count.
- `@babylonjs/core` imported ONLY under `src/lib/game/render/` (deep module paths, never the package root barrel).
- `step()` is the only sim state mutator; it returns a new state (input state never mutated).
- Sim tick = 1/60 s. Arena: player fixed at origin, spawn radius 20, kill radius 1.2.
- Commit format `type(game): …` (scope added in Task 1). Pre-commit runs typecheck+lint; every commit must pass.
- TDD: test first, watch it fail, minimal code, watch it pass.

---

### Task 1: Dependency + scope scaffolding

**Files:**
- Modify: `package.json` (via pnpm add)
- Modify: `commitlint.config.mjs` (scope enum)

**Interfaces:**
- Produces: `@babylonjs/core` available; commit scope `game` legal.

- [ ] **Step 1: Add Babylon (exact latest)**

Run: `pnpm add @babylonjs/core@9.16.1`
Expected: lockfile updated, install clean.

- [ ] **Step 2: Add `game` scope**

In `commitlint.config.mjs` scope-enum array, after `"book",` add:

```js
				"game",
```

- [ ] **Step 3: Verify checks pass**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml commitlint.config.mjs
git commit -m "chore(game): add @babylonjs/core and game commit scope"
```

---

### Task 2: Seeded RNG

**Files:**
- Create: `src/lib/game/sim/rng.ts`
- Test: `src/lib/game/sim/rng.test.ts`

**Interfaces:**
- Produces: `createRngState(seed: number): number`, `nextFloat(state: number): [value: number, next: number]` (value in [0,1)), `nextInt(state: number, maxExclusive: number): [value: number, next: number]`.

- [ ] **Step 1: Write failing test** (`rng.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { createRngState, nextFloat, nextInt } from "./rng";

describe("rng", () => {
	it("is deterministic for a seed", () => {
		let a = createRngState(42);
		let b = createRngState(42);
		for (let i = 0; i < 100; i++) {
			const [va, na] = nextFloat(a);
			const [vb, nb] = nextFloat(b);
			expect(va).toBe(vb);
			a = na;
			b = nb;
		}
	});

	it("differs across seeds", () => {
		expect(nextFloat(createRngState(1))[0]).not.toBe(
			nextFloat(createRngState(2))[0],
		);
	});

	it("nextFloat stays in [0,1)", () => {
		let s = createRngState(7);
		for (let i = 0; i < 1000; i++) {
			const [v, n] = nextFloat(s);
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(1);
			s = n;
		}
	});

	it("nextInt stays in range and advances state", () => {
		let s = createRngState(9);
		for (let i = 0; i < 1000; i++) {
			const [v, n] = nextInt(s, 5);
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(5);
			expect(n).not.toBe(s);
			s = n;
		}
	});
});
```

- [ ] **Step 2: Run to fail** — `pnpm test:run -- src/lib/game/sim/rng.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** (`rng.ts`)

```ts
/**
 * Mulberry32 PRNG in pure-functional form. State is a 32-bit integer;
 * every draw returns the value AND the next state so the simulation
 * stays a pure fold (required for deterministic replay).
 */
export function createRngState(seed: number): number {
	return seed >>> 0;
}

export function nextFloat(state: number): [value: number, next: number] {
	let t = (state + 0x6d2b79f5) >>> 0;
	const next = t;
	t = Math.imul(t ^ (t >>> 15), t | 1);
	t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
	const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	return [value, next];
}

export function nextInt(
	state: number,
	maxExclusive: number,
): [value: number, next: number] {
	const [f, next] = nextFloat(state);
	return [Math.floor(f * maxExclusive), next];
}
```

- [ ] **Step 4: Run to pass** — same command → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/sim/rng.ts src/lib/game/sim/rng.test.ts
git commit -m "feat(game): add pure seeded rng for deterministic sim"
```

---

### Task 3: Game state + initial state

**Files:**
- Create: `src/lib/game/sim/state.ts`
- Test: `src/lib/game/sim/state.test.ts`

**Interfaces:**
- Consumes: `createRngState` from Task 2.
- Produces:

```ts
export type Vec2 = { x: number; y: number };
export type EnemyState = {
	id: number;
	archetypeId: string;
	pos: Vec2;
	word: string;
	typedCount: number;
	hp: number;
	alive: boolean;
};
export type GameStatus = "running" | "gameover";
export type GameState = {
	tick: number;
	status: GameStatus;
	rngState: number;
	score: number;
	kills: number;
	misses: number;
	playerHp: number;
	targetId: number | null;
	nextEnemyId: number;
	enemies: EnemyState[];
};
export const ARENA = { spawnRadius: 20, killRadius: 1.2 } as const;
export function createInitialState(seed: number): GameState;
```

- [ ] **Step 1: Write failing test** (`state.test.ts`)

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
		expect(createInitialState(42)).toEqual(s);
	});
});
```

- [ ] **Step 2: Run to fail** — `pnpm test:run -- src/lib/game/sim/state.test.ts` → FAIL.

- [ ] **Step 3: Implement** (`state.ts`) — the types from Interfaces verbatim, plus:

```ts
import { createRngState } from "./rng";

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
	};
}
```

- [ ] **Step 4: Run to pass.**

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/sim/state.ts src/lib/game/sim/state.test.ts
git commit -m "feat(game): add game state types and initial state"
```

---

### Task 4: Skeleton content — grunt archetype + word picker

**Files:**
- Create: `src/lib/game/content/enemies.ts`
- Create: `src/lib/game/content/words.ts`
- Test: `src/lib/game/content/enemies.test.ts`, `src/lib/game/content/words.test.ts`

**Interfaces:**
- Consumes: `nextInt` (Task 2); `top200` from `@/lib/core/text/data` via `src/lib/core/text/words.ts` export (verify actual export name in that file: it re-exports word lists; import `top200` from `"@/lib/core/text/words"` — if that module doesn't re-export it, import from its actual location `"@/lib/core/text/words"` source; check file first, adjust import path, keep the pinned function signatures unchanged).
- Produces:

```ts
export type EnemyArchetype = {
	id: string;
	name: string;
	hp: number;
	speed: number; // arena units per tick
	size: number;
	tier: 1 | 2 | 3 | 4;
};
export const ENEMIES: EnemyArchetype[]; // skeleton: [grunt]
export function getArchetype(id: string): EnemyArchetype; // throws on unknown
export function pickWord(
	rngState: number,
	excludeInitials: ReadonlySet<string>,
): [word: string, next: number];
```

- [ ] **Step 1: Failing tests**

`enemies.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ENEMIES, getArchetype } from "./enemies";

describe("enemy content", () => {
	it("has valid archetypes", () => {
		expect(ENEMIES.length).toBeGreaterThanOrEqual(1);
		for (const e of ENEMIES) {
			expect(e.hp).toBeGreaterThan(0);
			expect(e.speed).toBeGreaterThan(0);
		}
	});
	it("looks up by id and throws on unknown", () => {
		expect(getArchetype("grunt").name).toBe("Grunt");
		expect(() => getArchetype("nope")).toThrow();
	});
});
```

`words.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createRngState } from "../sim/rng";
import { pickWord } from "./words";

describe("pickWord", () => {
	it("is deterministic and 3-6 chars", () => {
		const [w1] = pickWord(createRngState(5), new Set());
		const [w2] = pickWord(createRngState(5), new Set());
		expect(w1).toBe(w2);
		expect(w1.length).toBeGreaterThanOrEqual(3);
		expect(w1.length).toBeLessThanOrEqual(6);
	});
	it("avoids excluded initials when possible", () => {
		let s = createRngState(1);
		for (let i = 0; i < 50; i++) {
			const [w, n] = pickWord(s, new Set(["t", "a"]));
			expect(["t", "a"]).not.toContain(w[0]);
			s = n;
		}
	});
});
```

- [ ] **Step 2: Run to fail.**

- [ ] **Step 3: Implement**

`enemies.ts`:

```ts
export type EnemyArchetype = {
	id: string;
	name: string;
	hp: number;
	speed: number;
	size: number;
	tier: 1 | 2 | 3 | 4;
};

export const ENEMIES: EnemyArchetype[] = [
	{ id: "grunt", name: "Grunt", hp: 1, speed: 0.04, size: 0.8, tier: 1 },
];

const byId = new Map(ENEMIES.map((e) => [e.id, e]));

export function getArchetype(id: string): EnemyArchetype {
	const found = byId.get(id);
	if (!found) throw new Error(`Unknown enemy archetype: ${id}`);
	return found;
}
```

`words.ts`:

```ts
import { top200 } from "@/lib/core/text/words";
import { nextInt } from "../sim/rng";

const POOL = top200.filter((w) => w.length >= 3 && w.length <= 6);

export function pickWord(
	rngState: number,
	excludeInitials: ReadonlySet<string>,
): [word: string, next: number] {
	const filtered = POOL.filter((w) => !excludeInitials.has(w[0]));
	const pool = filtered.length > 0 ? filtered : POOL;
	const [i, next] = nextInt(rngState, pool.length);
	return [pool[i], next];
}
```

(If `top200` lives in `@/lib/core/text/data/...` and `words.ts` doesn't re-export it, import from wherever it is actually exported — inspect `src/lib/core/text/words.ts` and use its public export.)

- [ ] **Step 4: Run to pass.**

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/content
git commit -m "feat(game): add grunt archetype and deterministic word picker"
```

---

### Task 5: Sim step — spawn, chase, type-to-kill, death

**Files:**
- Create: `src/lib/game/sim/step.ts`
- Test: `src/lib/game/sim/step.test.ts`

**Interfaces:**
- Consumes: Tasks 2–4 exports.
- Produces:

```ts
export type GameEvent = { type: "key"; key: string };
export const SPAWN_INTERVAL_TICKS = 180;
export const MAX_ALIVE = 8;
export function step(state: GameState, events: readonly GameEvent[]): GameState;
```

Rules (skeleton):
- tick+1 each step; no-op if status `gameover`.
- Spawn: when `tick % SPAWN_INTERVAL_TICKS === 0` and alive < MAX_ALIVE → new grunt at angle `2π·nextFloat` on spawnRadius, word via `pickWord` excluding live initials.
- Movement: each alive enemy moves toward origin by `speed`.
- Reach `killRadius` → enemy dies (not a kill), `playerHp-1`; hp 0 → `status="gameover"`.
- Keys: if no target, nearest alive enemy whose `word[0]` matches (`isCharMatch`) becomes target with typedCount 1; else advance target's typedCount on match, `misses+1` on mismatch. Word complete → `alive=false`, `kills+1`, `score += 10*word.length`, target cleared. Target dying by reaching player also clears lock.

- [ ] **Step 1: Failing tests** (`step.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { createInitialState, type GameState } from "./state";
import { type GameEvent, MAX_ALIVE, SPAWN_INTERVAL_TICKS, step } from "./step";

function run(s: GameState, ticks: number, keysAt: Record<number, string[]> = {}) {
	let state = s;
	for (let i = 0; i < ticks; i++) {
		const keys = keysAt[state.tick + 1] ?? [];
		state = step(state, keys.map((k): GameEvent => ({ type: "key", key: k })));
	}
	return state;
}

describe("step", () => {
	it("spawns an enemy on the spawn interval", () => {
		const s = run(createInitialState(42), SPAWN_INTERVAL_TICKS + 1);
		expect(s.enemies.filter((e) => e.alive).length).toBeGreaterThanOrEqual(1);
	});

	it("caps alive enemies at MAX_ALIVE", () => {
		const s = run(createInitialState(42), SPAWN_INTERVAL_TICKS * 30);
		expect(s.enemies.filter((e) => e.alive).length).toBeLessThanOrEqual(MAX_ALIVE);
	});

	it("enemies move toward the player", () => {
		const a = run(createInitialState(42), SPAWN_INTERVAL_TICKS + 1);
		const b = step(a, []);
		const ea = a.enemies[0];
		const eb = b.enemies[0];
		expect(Math.hypot(eb.pos.x, eb.pos.y)).toBeLessThan(Math.hypot(ea.pos.x, ea.pos.y));
	});

	it("typing the full word kills the target", () => {
		let s = run(createInitialState(42), SPAWN_INTERVAL_TICKS + 1);
		const word = s.enemies[0].word;
		for (const ch of word) {
			s = step(s, [{ type: "key", key: ch }]);
		}
		expect(s.kills).toBe(1);
		expect(s.enemies[0].alive).toBe(false);
		expect(s.targetId).toBeNull();
		expect(s.score).toBe(10 * word.length);
	});

	it("counts a miss without breaking the lock", () => {
		let s = run(createInitialState(42), SPAWN_INTERVAL_TICKS + 1);
		const word = s.enemies[0].word;
		s = step(s, [{ type: "key", key: word[0] }]);
		const locked = s.targetId;
		s = step(s, [{ type: "key", key: "¤" }]);
		expect(s.misses).toBe(1);
		expect(s.targetId).toBe(locked);
	});

	it("enemy reaching player costs hp and eventually ends the game", () => {
		const s = run(createInitialState(42), 60 * 60 * 5); // 5 sim minutes untyped
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

- [ ] **Step 2: Run to fail.**

- [ ] **Step 3: Implement** (`step.ts`)

```ts
import { isCharMatch } from "@/lib/core/text/char-match";
import { getArchetype } from "../content/enemies";
import { pickWord } from "../content/words";
import { nextFloat } from "./rng";
import { ARENA, type EnemyState, type GameState } from "./state";

export type GameEvent = { type: "key"; key: string };
export const SPAWN_INTERVAL_TICKS = 180;
export const MAX_ALIVE = 8;

export function step(
	state: GameState,
	events: readonly GameEvent[],
): GameState {
	if (state.status === "gameover") return state;

	const s: GameState = {
		...state,
		tick: state.tick + 1,
		enemies: state.enemies.map((e) => ({ ...e, pos: { ...e.pos } })),
	};

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
		const enemy: EnemyState = {
			id: s.nextEnemyId,
			archetypeId: arch.id,
			pos: {
				x: Math.cos(angle) * ARENA.spawnRadius,
				y: Math.sin(angle) * ARENA.spawnRadius,
			},
			word,
			typedCount: 0,
			hp: arch.hp,
			alive: true,
		};
		s.nextEnemyId += 1;
		s.enemies = [...s.enemies, enemy];
	}

	// movement + player collision
	for (const e of s.enemies) {
		if (!e.alive) continue;
		const arch = getArchetype(e.archetypeId);
		const dist = Math.hypot(e.pos.x, e.pos.y);
		if (dist <= ARENA.killRadius) continue;
		const stepLen = Math.min(arch.speed, dist);
		e.pos.x -= (e.pos.x / dist) * stepLen;
		e.pos.y -= (e.pos.y / dist) * stepLen;
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

	// typing
	for (const ev of events) {
		if (ev.type !== "key") continue;
		const target = s.enemies.find((e) => e.id === s.targetId && e.alive);
		if (!target) {
			s.targetId = null;
			const candidates = s.enemies
				.filter((e) => e.alive && isCharMatch(ev.key, e.word[0]))
				.sort(
					(a, b) =>
						Math.hypot(a.pos.x, a.pos.y) - Math.hypot(b.pos.x, b.pos.y),
				);
			if (candidates.length === 0) {
				s.misses += 1;
				continue;
			}
			const picked = candidates[0];
			picked.typedCount = 1;
			s.targetId = picked.id;
			finishIfComplete(s, picked);
			continue;
		}
		if (isCharMatch(ev.key, target.word[target.typedCount])) {
			target.typedCount += 1;
			finishIfComplete(s, target);
		} else {
			s.misses += 1;
		}
	}

	return s;
}

function finishIfComplete(s: GameState, e: EnemyState): void {
	if (e.typedCount < e.word.length) return;
	e.alive = false;
	s.kills += 1;
	s.score += 10 * e.word.length;
	s.targetId = null;
}
```

- [ ] **Step 4: Run to pass** — `pnpm test:run -- src/lib/game` → all green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/sim/step.ts src/lib/game/sim/step.test.ts
git commit -m "feat(game): add fixed-timestep sim step with spawn, chase and type-to-kill"
```

---

### Task 6: Replay + state hash

**Files:**
- Create: `src/lib/game/sim/replay.ts`
- Test: `src/lib/game/sim/replay.test.ts`

**Interfaces:**
- Consumes: `createInitialState`, `step`, `GameEvent`.
- Produces:

```ts
export type InputLog = { seed: number; ticks: number; events: { tick: number; key: string }[] };
export function runReplay(log: InputLog): GameState;
export function stateHash(state: GameState): string;
```

- [ ] **Step 1: Failing test** (`replay.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { runReplay, stateHash } from "./replay";
import { SPAWN_INTERVAL_TICKS, step } from "./step";
import { createInitialState } from "./state";

describe("replay", () => {
	it("replays a scripted kill deterministically", () => {
		// derive the word the first spawned enemy will carry
		let probe = createInitialState(42);
		for (let i = 0; i <= SPAWN_INTERVAL_TICKS; i++) probe = step(probe, []);
		const word = probe.enemies[0].word;

		const start = SPAWN_INTERVAL_TICKS + 2;
		const log = {
			seed: 42,
			ticks: start + word.length + 10,
			events: [...word].map((key, i) => ({ tick: start + i, key })),
		};
		const a = runReplay(log);
		const b = runReplay(log);
		expect(a.kills).toBe(1);
		expect(stateHash(a)).toBe(stateHash(b));
	});

	it("hash changes when outcome changes", () => {
		const base = { seed: 42, ticks: 300, events: [] };
		const other = { seed: 43, ticks: 300, events: [] };
		expect(stateHash(runReplay(base))).not.toBe(stateHash(runReplay(other)));
	});
});
```

- [ ] **Step 2: Run to fail.**

- [ ] **Step 3: Implement** (`replay.ts`)

```ts
import { createInitialState, type GameState } from "./state";
import { type GameEvent, step } from "./step";

export type InputLog = {
	seed: number;
	ticks: number;
	events: { tick: number; key: string }[];
};

export function runReplay(log: InputLog): GameState {
	let state = createInitialState(log.seed);
	for (let t = 1; t <= log.ticks; t++) {
		const events: GameEvent[] = log.events
			.filter((e) => e.tick === t)
			.map((e) => ({ type: "key", key: e.key }));
		state = step(state, events);
	}
	return state;
}

/** FNV-1a over the canonical JSON of the state. Sim state is built with a
 * fixed key order, so JSON.stringify is stable across runs and engines. */
export function stateHash(state: GameState): string {
	const json = JSON.stringify(state);
	let hash = 0x811c9dc5;
	for (let i = 0; i < json.length; i++) {
		hash ^= json.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16);
}
```

- [ ] **Step 4: Run to pass.**

- [ ] **Step 5: Add golden fixture** — Create `src/lib/game/sim/__fixtures__/replay-first-kill.json` by running a tiny script inline (node with tsx unavailable; instead add a test that WRITES nothing — generate the fixture via a temporary Vitest run):

Add to `replay.test.ts`:

```ts
	it("matches the golden fixture hash", async () => {
		const fixture = await import("./__fixtures__/replay-first-kill.json");
		const result = runReplay(fixture.log);
		expect(stateHash(result)).toBe(fixture.expectedHash);
		expect(result.kills).toBe(fixture.expectedKills);
	});
```

Generate the fixture: temporarily `console.log` the log + hash from the first test (or a one-off `vitest run` with a `.only` and inline log), then write `__fixtures__/replay-first-kill.json`:

```json
{
	"log": { "seed": 42, "ticks": 0, "events": [] },
	"expectedHash": "REPLACE_WITH_PRINTED",
	"expectedKills": 1
}
```

Fill `log.ticks`/`events`/`expectedHash` with the printed real values, remove the temporary logging, re-run → PASS. (`resolveJsonModule` is on by default in the repo tsconfig; if not, enable it in the same commit.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/sim/replay.ts src/lib/game/sim/replay.test.ts src/lib/game/sim/__fixtures__
git commit -m "test(game): add deterministic replay runner with golden hash fixture"
```

---

### Task 7: Babylon render layer

**Files:**
- Create: `src/lib/game/render/scene.ts`
- Create: `src/lib/game/render/enemy-renderer.ts`
- Create: `src/lib/game/render/loop.ts`

No unit tests (render layer verified by E2E/visual in Task 9); keep every file under ~120 lines.

**Interfaces:**
- Consumes: `GameState`, `step`, `GameEvent`, `createInitialState`.
- Produces:

```ts
// scene.ts
export type GameScene = { engine: Engine; scene: Scene; dispose(): void };
export function createGameScene(canvas: HTMLCanvasElement): GameScene;
// enemy-renderer.ts
export function createEnemyRenderer(scene: Scene): { sync(state: GameState): void; dispose(): void };
// loop.ts
export type GameLoopOptions = {
	canvas: HTMLCanvasElement;
	seed: number;
	testMode: boolean;
	onState(state: GameState): void; // HUD callback, called at most once per frame
};
export type GameLoop = {
	pushKey(key: string): void;
	stepTicks(n: number): void; // test hook: advance sim manually
	getState(): GameState;
	dispose(): void;
};
export function startGameLoop(opts: GameLoopOptions): GameLoop;
```

- [ ] **Step 1: scene.ts**

```ts
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4, Vector3 } from "@babylonjs/core/Maths/math";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import { Scene } from "@babylonjs/core/scene";

export type GameScene = { engine: Engine; scene: Scene; dispose(): void };

export function createGameScene(canvas: HTMLCanvasElement): GameScene {
	const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
	const scene = new Scene(engine);
	scene.clearColor = new Color4(0.04, 0.04, 0.07, 1);

	const camera = new ArcRotateCamera(
		"cam",
		-Math.PI / 2,
		0.9,
		34,
		Vector3.Zero(),
		scene,
	);
	camera.inputs.clear(); // fixed camera — typing is the only input

	new HemisphericLight("light", new Vector3(0, 1, 0), scene);

	const ground = CreateDisc("ground", { radius: 22, tessellation: 64 }, scene);
	ground.rotation.x = Math.PI / 2;
	const groundMat = new StandardMaterial("groundMat", scene);
	groundMat.diffuseColor = new Color3(0.09, 0.09, 0.13);
	groundMat.specularColor = Color3.Black();
	ground.material = groundMat;

	const player = CreateCylinder(
		"player",
		{ height: 1.2, diameterTop: 0, diameterBottom: 1 },
		scene,
	);
	player.position.y = 0.6;
	const playerMat = new StandardMaterial("playerMat", scene);
	playerMat.emissiveColor = new Color3(0.3, 0.8, 1);
	player.material = playerMat;

	return {
		engine,
		scene,
		dispose() {
			scene.dispose();
			engine.dispose();
		},
	};
}
```

- [ ] **Step 2: enemy-renderer.ts**

```ts
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { getArchetype } from "../content/enemies";
import type { GameState } from "../sim/state";

type EnemyVisual = {
	root: TransformNode;
	label: Mesh;
	texture: DynamicTexture;
	lastText: string;
};

export function createEnemyRenderer(scene: Scene) {
	const visuals = new Map<number, EnemyVisual>();

	function create(id: number, archetypeId: string): EnemyVisual {
		const arch = getArchetype(archetypeId);
		const root = new TransformNode(`enemy-${id}`, scene);
		const body = CreateSphere(`enemy-${id}-body`, { diameter: arch.size }, scene);
		body.parent = root;
		body.position.y = arch.size / 2;
		const mat = new StandardMaterial(`enemy-${id}-mat`, scene);
		mat.diffuseColor = new Color3(0.85, 0.25, 0.3);
		body.material = mat;

		const label = CreatePlane(`enemy-${id}-label`, { width: 3, height: 0.8 }, scene);
		label.parent = root;
		label.position.y = arch.size + 0.9;
		label.billboardMode = 7; // BILLBOARDMODE_ALL
		const texture = new DynamicTexture(
			`enemy-${id}-tex`,
			{ width: 256, height: 64 },
			scene,
			false,
		);
		texture.hasAlpha = true;
		const labelMat = new StandardMaterial(`enemy-${id}-labelmat`, scene);
		labelMat.diffuseTexture = texture;
		labelMat.emissiveColor = Color3.White();
		labelMat.backFaceCulling = false;
		label.material = labelMat;

		return { root, label, texture, lastText: "" };
	}

	function drawLabel(v: EnemyVisual, word: string, typedCount: number) {
		const text = `${word}:${typedCount}`;
		if (text === v.lastText) return;
		v.lastText = text;
		const ctx = v.texture.getContext();
		ctx.clearRect(0, 0, 256, 64);
		v.texture.drawText(
			word,
			null,
			44,
			"bold 40px monospace",
			typedCount > 0 ? "#facc15" : "#e5e7eb",
			"transparent",
			true,
		);
		v.texture.update();
	}

	return {
		sync(state: GameState) {
			for (const e of state.enemies) {
				let v = visuals.get(e.id);
				if (!e.alive) {
					if (v) {
						v.root.dispose(false, true);
						visuals.delete(e.id);
					}
					continue;
				}
				if (!v) {
					v = create(e.id, e.archetypeId);
					visuals.set(e.id, v);
				}
				v.root.position.x = e.pos.x;
				v.root.position.z = e.pos.y;
				drawLabel(v, e.word, e.typedCount);
			}
		},
		dispose() {
			for (const v of visuals.values()) v.root.dispose(false, true);
			visuals.clear();
		},
	};
}
```

- [ ] **Step 3: loop.ts**

```ts
import type { GameState } from "../sim/state";
import { createInitialState } from "../sim/state";
import { type GameEvent, step } from "../sim/step";
import { createEnemyRenderer } from "./enemy-renderer";
import { createGameScene } from "./scene";

const TICK_MS = 1000 / 60;
const MAX_CATCHUP_TICKS = 30; // degraded-tab guard

export type GameLoopOptions = {
	canvas: HTMLCanvasElement;
	seed: number;
	testMode: boolean;
	onState(state: GameState): void;
};

export type GameLoop = {
	pushKey(key: string): void;
	stepTicks(n: number): void;
	getState(): GameState;
	dispose(): void;
};

export function startGameLoop(opts: GameLoopOptions): GameLoop {
	const gameScene = createGameScene(opts.canvas);
	const enemies = createEnemyRenderer(gameScene.scene);
	let state = createInitialState(opts.seed);
	let pending: GameEvent[] = [];
	let accumulator = 0;
	let lastTime = performance.now();

	function advance(ticks: number) {
		for (let i = 0; i < ticks; i++) {
			state = step(state, pending);
			pending = [];
		}
	}

	function render() {
		enemies.sync(state);
		opts.onState(state);
		gameScene.scene.render();
	}

	if (!opts.testMode) {
		gameScene.engine.runRenderLoop(() => {
			const now = performance.now();
			accumulator += now - lastTime;
			lastTime = now;
			let ticks = Math.floor(accumulator / TICK_MS);
			accumulator -= ticks * TICK_MS;
			if (ticks > MAX_CATCHUP_TICKS) ticks = MAX_CATCHUP_TICKS;
			advance(ticks);
			render();
		});
	} else {
		render(); // single deterministic frame; tests drive via stepTicks
	}

	return {
		pushKey(key: string) {
			pending.push({ type: "key", key });
			if (opts.testMode) {
				advance(1);
				render();
			}
		},
		stepTicks(n: number) {
			advance(n);
			render();
		},
		getState: () => state,
		dispose() {
			gameScene.engine.stopRenderLoop();
			enemies.dispose();
			gameScene.dispose();
		},
	};
}
```

- [ ] **Step 4: Verify** — `pnpm typecheck && pnpm lint` → clean. (Behaviour verified in Task 9.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/render
git commit -m "feat(game): add babylon scene, enemy renderer and fixed-timestep loop"
```

---

### Task 8: Solid shell + route

**Files:**
- Create: `src/components/game/GameShell.tsx`
- Create: `src/routes/Game.tsx`
- Modify: `src/index.tsx` (add route)

**Interfaces:**
- Consumes: `startGameLoop` (dynamic import), `GameState`.
- Produces: `/game` route; `window.__game = { getState, sendKeys, stepTicks }` when `testMode`.

- [ ] **Step 1: GameShell.tsx**

```tsx
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import type { GameState } from "@/lib/game/sim/state";
import type { GameLoop } from "@/lib/game/render/loop";

declare global {
	interface Window {
		__game?: {
			getState(): GameState;
			sendKeys(keys: string): void;
			stepTicks(n: number): void;
		};
	}
}

export default function GameShell() {
	let canvasRef: HTMLCanvasElement | undefined;
	let loop: GameLoop | undefined;
	const [hud, setHud] = createSignal<GameState | null>(null);
	const [ready, setReady] = createSignal(false);

	const params = new URLSearchParams(window.location.search);
	const seed = Number(params.get("seed") ?? Date.now() % 2 ** 31);
	const testMode = params.get("testMode") === "1";

	onMount(async () => {
		const { startGameLoop } = await import("@/lib/game/render/loop");
		if (!canvasRef) return;
		loop = startGameLoop({
			canvas: canvasRef,
			seed,
			testMode,
			onState: setHud,
		});
		if (testMode) {
			window.__game = {
				getState: () => loop!.getState(),
				sendKeys: (keys) => {
					for (const k of keys) loop!.pushKey(k);
				},
				stepTicks: (n) => loop!.stepTicks(n),
			};
		}
		setReady(true);
	});

	onCleanup(() => {
		loop?.dispose();
		if (testMode) window.__game = undefined;
	});

	function onKeyDown(e: KeyboardEvent) {
		if (e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey) return;
		loop?.pushKey(e.key);
	}

	onMount(() => {
		window.addEventListener("keydown", onKeyDown);
		onCleanup(() => window.removeEventListener("keydown", onKeyDown));
	});

	return (
		<div class="relative h-[calc(100vh-8rem)] w-full" data-testid="game-shell">
			<canvas ref={canvasRef} class="h-full w-full outline-none" />
			<Show when={!ready()}>
				<div class="absolute inset-0 grid place-items-center text-sm opacity-70">
					Loading arena…
				</div>
			</Show>
			<Show when={hud()}>
				{(state) => (
					<div class="pointer-events-none absolute top-3 left-1/2 flex -translate-x-1/2 gap-6 font-mono text-sm">
						<span data-testid="game-score">score {state().score}</span>
						<span data-testid="game-hp">hp {state().playerHp}</span>
						<span data-testid="game-kills">kills {state().kills}</span>
					</div>
				)}
			</Show>
			<Show when={hud()?.status === "gameover"}>
				<div
					class="absolute inset-0 grid place-items-center bg-black/60"
					data-testid="game-over"
				>
					<div class="text-center">
						<p class="text-2xl font-bold">Run over</p>
						<p class="mt-2 font-mono">score {hud()?.score}</p>
					</div>
				</div>
			</Show>
		</div>
	);
}
```

- [ ] **Step 2: Game.tsx**

```tsx
import GameShell from "@/components/game/GameShell";

export default function Game() {
	return <GameShell />;
}
```

- [ ] **Step 3: Register route** in `src/index.tsx` — add after Settings lazy import and route:

```tsx
const Game = lazy(() => import("./routes/Game"));
// …
				<Route path="/game" component={Game} />
```

- [ ] **Step 4: Manual smoke** — `pnpm dev`, open `http://localhost:3000/game?seed=42` — arena renders, grunt approaches after 3 s, typing its word kills it. Then `pnpm typecheck && pnpm lint && pnpm build` → clean; confirm Babylon lands in the lazy chunk (build output: `Game-*.js` chunk ≫ others, `index-*.js` roughly unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/components/game src/routes/Game.tsx src/index.tsx
git commit -m "feat(game): add /game route with solid shell, hud and test hooks"
```

---

### Task 9: E2E smoke + visual snapshot

**Files:**
- Create: `e2e/game.spec.ts`

**Interfaces:**
- Consumes: `/game?seed=42&testMode=1`, `window.__game` hooks, testids from Task 8.

- [ ] **Step 1: Write the spec**

```ts
import { expect, test } from "@playwright/test";

test.describe("horde game mode", () => {
	test("loads arena and kills first enemy by typing", async ({ page }) => {
		await page.goto("/game?seed=42&testMode=1");
		await expect(page.getByTestId("game-shell")).toBeVisible();
		await page.waitForFunction(() => window.__game !== undefined);

		// advance past first spawn deterministically
		await page.evaluate(() => window.__game!.stepTicks(181));
		const word = await page.evaluate(
			() => window.__game!.getState().enemies[0].word,
		);
		await page.evaluate((w) => window.__game!.sendKeys(w), word);

		await expect(page.getByTestId("game-kills")).toHaveText("kills 1");
		const state = await page.evaluate(() => window.__game!.getState());
		expect(state.kills).toBe(1);
	});

	test("visual: deterministic arena frame", async ({ page }) => {
		await page.goto("/game?seed=42&testMode=1");
		await page.waitForFunction(() => window.__game !== undefined);
		await page.evaluate(() => window.__game!.stepTicks(400));
		await expect(page.locator("canvas")).toHaveScreenshot("horde-arena.png", {
			maxDiffPixelRatio: 0.02,
		});
	});
});
```

(`window.__game` type comes from the global declaration in GameShell; if Playwright's tsconfig doesn't see it, add `declare global` block at the top of the spec.)

- [ ] **Step 2: Run** — `pnpm test:e2e -- game.spec.ts` → first run creates the snapshot; run again → PASS. If WebGL fails headless, add to `playwright.config.ts` chromium project: `launchOptions: { args: ["--enable-unsafe-swiftshader"] }`.

- [ ] **Step 3: Full suite** — `pnpm test:run && pnpm test:e2e` → all green.

- [ ] **Step 4: Commit**

```bash
git add e2e/game.spec.ts e2e/game.spec.ts-snapshots playwright.config.ts
git commit -m "test(e2e): add horde smoke and deterministic visual snapshot"
```

---

### Task 10: Skeleton docs + push

**Files:**
- Create: `docs/game-design.md` (skeleton section only)
- Modify: `docs/progress.md` (status note)

- [ ] **Step 1: Write `docs/game-design.md`**

```markdown
# Horde Mode — Game Design & Architecture

Status: walking skeleton (spec: docs/superpowers/specs/2026-07-11-horde-typing-game-design.md)

## Layers

- `src/lib/game/sim` — pure fixed-timestep simulation (60Hz ticks, seeded rng, `step()` sole mutator)
- `src/lib/game/content` — data-driven enemy archetypes + word banding
- `src/lib/game/render` — Babylon adapter (lazy-loaded with the `/game` route)
- `src/components/game` — Solid shell: HUD, overlays, keyboard capture

## Determinism

Same seed + same `{tick,key}` log ⇒ identical `stateHash`. Golden fixtures live in
`src/lib/game/sim/__fixtures__`. Test hooks: `/game?seed=N&testMode=1` freezes the loop
and exposes `window.__game.{getState,sendKeys,stepTicks}`.

## Next phases

Sim depth (waves, combat, powerups, combo score) → 30+ enemy roster → render polish →
persistence + HUD screens. See the spec §11.
```

- [ ] **Step 2: Append to `docs/progress.md`**: one line under the latest section: `- Horde game mode: walking skeleton complete (/game, deterministic sim + replay + visual test)`.

- [ ] **Step 3: Commit + push**

```bash
git add docs/game-design.md docs/progress.md
git commit -m "docs(game): document horde skeleton architecture and determinism hooks"
git push
```

- [ ] **Step 4: Watch CI green** — `gh run watch <id> --exit-status`.

---

## After this plan

Run `/code-review` on the skeleton diff (major junction 1), fix findings, then author
Plan 2 (sim depth), Plan 3 (30+ roster/content), Plan 4 (render polish + asset-pipeline
decision gate), Plan 5 (persistence, ModeSelector entry, docs finish).
