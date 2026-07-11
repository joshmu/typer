# Horde Mode — Persistence + App Integration Implementation Plan (Plan 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish Horde as a first-class Typer mode: start/death screens with real stats (WPM, accuracy), runs persisted to Dexie with best-run surfacing, a Horde entry in the app's mode navigation, and final docs.

**Architecture:** Persistence mirrors the existing `results` patterns (`src/lib/db.ts`, `src/lib/queries.ts`, `safeFrom` fallbacks). Stats derive from sim state via pure helpers in `src/lib/game/sim/` (tested). UI stays in `src/components/game/` (Solid). No sim behaviour changes — fixtures must NOT need re-recording in this plan (adding derived pure helpers is fine; changing `step()` is not).

## Global Constraints

- Sim `step()`/state shape frozen (replay fixtures unchanged — treat a needed re-record as a design error in this plan).
- Dexie schema bump follows the existing versioned pattern in `src/lib/db.ts`; new table `gameRuns`. Tests via `fake-indexeddb` mirroring `db.test.ts` style.
- Reuse `src/lib/core/calc` for WPM math — do not reimplement.
- Every commit green (`typecheck && lint && test:run`); E2E green at task ends. Commit trailer:

  ```
  Claude-Session: https://claude.ai/code/session_01N1YqXkNqwh76TbQtmr9DRC
  ```

---

### Task 1: Run stats derivation (pure)

**Files:**
- Create: `src/lib/game/sim/run-stats.ts` + `run-stats.test.ts`

```ts
export type RunStats = {
	score: number;
	wave: number;
	kills: number;
	durationSeconds: number; // tick / 60
	accuracy: number; // hits / (hits + misses) * 100, 100 when no keys
	wpm: number; // typed chars/5 per minute — use calculateWpm from core calc if signature fits, else charCount*12/duration
};
export function deriveRunStats(state: GameState): RunStats;
```

Hits = total typed chars landed = sum over kills of word lengths is NOT tracked;
instead add nothing to sim — derive hits as `keystrokes - misses` requires a
keystroke counter which DOES exist? Check `GameState`: it has `misses` only. A
`hits` counter is required → this is the ONE permitted state addition: add
`hits: number` to `GameState` (incremented in the typing loop on every matched key,
in `step.ts`), fixture re-record allowed ONLY for this single change, done in THIS
task (RECORD_FIXTURE procedure from Plan 2). Everything downstream is derived.

TDD: unit tests for accuracy edge cases (no input → 100), wpm math vs core calc,
duration. Commit: `feat(game): track hits and derive run stats`

---

### Task 2: gameRuns persistence

**Files:**
- Modify: `src/lib/db.ts` (+ `db.test.ts`)
- Create: `src/lib/game-runs.ts` + `game-runs.test.ts`

```ts
// db.ts — version(4)
gameRuns: "++id, timestamp, score, wave";
export interface GameRun {
	id?: number;
	score: number;
	wave: number;
	kills: number;
	wpm: number;
	accuracy: number;
	durationSeconds: number;
	seed: number;
	timestamp: number;
}

// game-runs.ts
export async function saveGameRun(run: Omit<GameRun, "id">): Promise<number>;
export function useBestRun(): /* safeFrom */ Accessor<GameRun | undefined>; // orderBy("score").reverse().first()
export function useRecentRuns(limit?: number): Accessor<GameRun[]>;
```

`useBestRun` needs `score` indexed — it is (schema above). Follow `queries.ts` +
`safeFrom` patterns exactly. Tests with fake-indexeddb: save → fetch, best-run
ordering, v3→v4 upgrade keeps existing tables.

Commit: `feat(db): persist horde runs with best-run queries`

---

### Task 3: Start + death screens

**Files:**
- Modify: `src/components/game/GameShell.tsx`
- Create: `src/components/game/DeathScreen.tsx`, `src/components/game/StartScreen.tsx`

Start screen: shown before first input; title, one-line how-to ("type the word above an
enemy to shoot it"), best run (from `useBestRun()`), "press any key". First keydown
starts the loop (loop creation stays lazy as-is; gate `pushKey` until started; in
testMode auto-start so probes keep working).

Death screen (replaces bare "Run over"): stats grid from `deriveRunStats` (score, wave,
kills, WPM, accuracy, duration), "NEW BEST" badge when applicable, restart via `R` or
click — restart = dispose loop + start fresh with a NEW random seed (or same seed when
`?seed=` was explicitly provided). On gameover transition (render-side watch of
`status`), call `saveGameRun` exactly once (guard flag reset on restart).

E2E additions (`e2e/game.spec.ts`): death screen assertion — drive with
`window.__game.stepTicks` until gameover (untyped ~ a few waves; cap loop), assert
stats visible and testids `game-over-score`, `game-restart`. Restart probe: send `r`,
assert HUD resets.

Commit: `feat(game): add start and death screens with persisted stats`

---

### Task 4: App integration — mode entry + nav

**Files:**
- Modify: `src/components/typing/ModeSelector.tsx` (read it first; follow its item
  pattern — add a "horde" entry that NAVIGATES to `/game` instead of switching typing
  mode; visually distinct accent)
- Modify: `src/components/layout/Header.tsx` if nav links exist there (check; add
  Game link consistent with existing About/Settings links)

E2E: home → click Horde → lands on `/game`, canvas visible.

Commit: `feat(game): add horde entry to mode selector and nav`

---

### Task 5: Docs finish + roadmap/progress

**Files:**
- Modify: `docs/game-design.md` — full gameplay reference: enemy families table
  (generated from content — keep human-written summary + pointer to `enemies.ts` as
  source of truth), powerups, scoring/combo rules, wave pacing, determinism/replay
  guide (how to record a fixture, how test hooks work), perf budgets + probe locations,
  asset pipeline usage.
- Modify: `docs/progress.md` — Horde section: all phases complete.
- Modify: `CLAUDE.md` — add `src/lib/game/` to the architecture map + one-line rules
  (pure sim, deterministic math module, render isolation), `game` scope note.

Commit: `docs(game): complete horde gameplay and architecture documentation`

---

## Completion gate

Full suite + build + E2E green locally and on CI. Then final `/code-review` junction
on the whole feature branch range, fixes applied, push, CI green — feature done.
