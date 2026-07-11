# Horde Mode — Game Design & Architecture

Status: complete (spec: `docs/superpowers/specs/2026-07-11-horde-typing-game-design.md`)

Horde is a first-class Typer mode: a seeded, deterministic wave-survival arcade
game where you type the word floating above each enemy to shoot it. Reachable
from the mode selector and header nav (`/game`).

## Layers

- `src/lib/game/sim` — pure fixed-timestep simulation (60Hz ticks, seeded rng, `step()` sole mutator; no DOM/framework)
- `src/lib/game/content` — data-driven enemy archetypes + word banding
- `src/lib/game/render` — Babylon adapter + loop (lazy-loaded with the `/game` route)
- `src/components/game` — Solid shell: HUD, start/death overlays, keyboard capture
- `src/lib/game-runs.ts` — Dexie persistence for run history (best-run + recent queries)

## Enemy families

Source of truth: `src/lib/game/content/enemies.ts` (30 archetypes). The roster is
6 regular families × 4 tiers (24) + 6 word-chain bosses. Each family owns one
movement; tiers escalate hp/size and layer on abilities.

| Family   | Movement          | Character                                  |
|----------|-------------------|--------------------------------------------|
| Husk     | `chase`           | straight-line pressure; enrage/heal at high tiers |
| Darter   | `zigzag`          | erratic lateral weaving                    |
| Wraith   | `orbit-then-dive` | circles the core, then commits inward      |
| Charger  | `dash-pause`      | bursts of speed punctuated by pauses       |
| Weaver   | `flank`           | approaches off-axis to flank the core      |
| Brood    | `spiral`          | inward spiral; the `split`/`spawn` minion source (`brood-1`) |

**Movements** (`MovementId`): `chase`, `zigzag`, `orbit-then-dive`, `dash-pause`,
`flank`, `spiral`.

**Abilities** (`Ability`): `split` (burst minions on death), `shield` (absorbs N
word-completions before taking damage), `cloak` (periodically untargetable),
`spawn` (periodically fields minions), `heal-aura` (heals nearby enemies),
`enrage-at-half` (speeds up below half hp), `teleport` (periodic jump), and
`armored-front` (only exposed within a radius of the core). All eight abilities
and all six movements are represented across the roster; bosses are tier-4
word-chain enemies that reassign a new word on each completion.

## Word bands

`pickWordForTier(tier, rng, excludeInitials)` draws length-banded words from
`english-1k` (tiers 1–2) and `english-5k` (tiers 3–4). Enemies draw from their
tier; boss chains and multi-hp/absorb reassignments redraw within the same band.
Initials of every live enemy **and** active powerup are excluded so a keystroke
is never ambiguous between two targets.

## Powerups

Source: `src/lib/game/sim/powerups.ts`. A powerup pickup spawns every
`POWERUP_SPAWN_EVERY_KILLS = 12` kills (milestone-tracked so a double-kill tick
that jumps past a multiple still spawns). Pickups carry a short word from a
distinct bank (`nova, pulse, surge, blitz, volt, flux`; falls back to `pickWord`
if the initial collides with a live enemy) and expire after
`POWERUP_LIFETIME_TICKS = 600`. Typing a pickup's word applies its effect:

| Kind   | Effect                                       | Constant |
|--------|----------------------------------------------|----------|
| freeze | halts all enemy movement                     | `FREEZE_TICKS = 180` |
| slow   | enemies move at half speed                   | `SLOW_TICKS = 300`, `SLOW_FACTOR = 0.5` |
| heal   | +1 player hp (capped at `maxPlayerHp`)       | — |
| bomb   | kills every live enemy immediately           | — |

## Scoring & combo

Source: `src/lib/game/sim/score.ts` + `combat.ts`.

- **Kill score:** `10 × wordLength × comboMultiplier(combo)`.
- **Combo multiplier:** `1 + min(4, floor(combo / 5))` → ranges 1×–5×.
- **Combo** increments on each kill and decays to 0 after
  `COMBO_DECAY_TICKS = 180` ticks without a kill; any miss also breaks it.
- **Partial completions** (shield absorb, multi-hp chip, boss chain) award a flat
  `10 × wordLength` (no combo multiplier) and reassign a fresh word.
- **hits counter** (`GameState.hits`) increments on every matched keystroke and
  feeds the run-summary accuracy (`hits / (hits + misses)`) and WPM
  (`hits / 5` per minute, matching core `calculateWPM`) via
  `deriveRunStats()` (`src/lib/game/sim/run-stats.ts`).

## Wave pacing

Source: `src/lib/game/sim/spawner.ts`. Player starts with 3 hp; an enemy reaching
the core (`ARENA.killRadius`) costs 1 hp and gameover fires at 0.

- **Wave size:** `waveEnemyCount(wave) = 3 + wave × 2`.
- **Tier gating:** tiers unlock at waves 1 / 3 / 6 / 10; `tierWeight` shifts the
  spawn mix toward higher tiers as waves climb.
- **Bosses:** every 5th wave has a ~1-in-3 chance to field a boss.
- **Caps & timing:** `MAX_ALIVE = 8` (soft, wave director), `ALIVE_HARD_CAP = 16`
  (absolute, includes ability-spawned minions), `SPAWN_COOLDOWN_TICKS = 45`,
  `INTERMISSION_TICKS = 180`, `INITIAL_INTERMISSION_TICKS = 60`.

## Persistence

Runs are stored in the Dexie `gameRuns` table (db **v4**, `src/lib/db.ts`),
indexed on `score` and `timestamp`. `saveGameRun` persists a run **exactly once**
per gameover (one-shot guard in `GameShell`, reset on restart). `useBestRun()` and
`useRecentRuns()` (`src/lib/game-runs.ts`) are reactive `safeFrom` queries. The
start screen surfaces the best run; the death screen shows the derived summary
(score, wave, kills, WPM, accuracy, duration) with a NEW BEST badge when the run
beats the prior best. Restart (R or click) disposes the loop and starts fresh
with a new random seed — or the pinned `?seed=` when one was provided.

## Determinism & replay guide

Same seed + same `{tick, key}` log ⇒ identical `stateHash` (FNV-1a over the
state's canonical JSON, `src/lib/game/sim/replay.ts`). Golden fixtures live in
`src/lib/game/sim/__fixtures__` (`replay-first-kill.json`, `replay-deep-run.json`).

- **Recording a fixture:** the `[record]` tests in `replay.test.ts` regenerate the
  committed JSON from the current sim when `RECORD_FIXTURE` is set:
  `RECORD_FIXTURE=1 pnpm test:run -- src/lib/game/sim/replay.test.ts`.
  Re-recording is only legitimate when a **deliberate** sim change alters the
  hash (e.g. the `hits` counter addition) — an unexpected hash drift is a bug.
- **Determinism scan:** `determinism.test.ts` statically bans `Math.hypot/cos/sin/
  tan/random` and `Date.now` in every non-test `sim/` and `content/` source (those
  are engine-approximated or impure). Use the `cosR/sinR` helpers in `math.ts`.
- **Test hooks:** `/game?seed=N&testMode=1` freezes the render loop and exposes
  `window.__game.{getState, sendKeys, stepTicks, renderReady}`. In testMode the
  shell auto-starts (no start-screen gate) so probes drive the sim directly.

## Performance budgets & probes

Every keystroke must process in **< 16ms** (one 60fps frame; see
`docs/performance-guide.md`). Probes:

- `src/lib/game/sim/perf.test.ts` — pure `step()` hot-path guard; warms to a
  dense high-wave state, then asserts p95 stays inside a CI-safe budget (logs
  avg/p95/max).
- `e2e/performance.spec.ts` — `KEYSTROKE_BUDGET_MS = 16`; measures the in-browser
  game keystroke round-trip via `window.__game` and asserts p95 under budget.

## Visual regression

`e2e/game.spec.ts` snapshots a deterministic frame (fixed seed, fixed tick count).
The baseline is darwin-only while visuals settle (`test.skip` gate for non-darwin);
regenerate after intentional start-screen/HUD drift with
`pnpm exec playwright test game.spec.ts --update-snapshots`. The linux CI baseline
lands at visual-freeze, after which the snapshot gates CI. The capture waits on
`window.__game.renderReady()` so it never races async PNG texture decode.

## Asset pipeline

- **Decision:** game textures are **generated-procedural**, not binary art or glTF.
  `scripts/gen-assets.ts` is a zero-dependency, seeded (`SEED = 0x9e3779b9`),
  idempotent node script that hand-rolls a minimal RGBA PNG encoder (filter 0,
  `node:zlib` deflate, inline CRC32) and emits committed outputs under
  `public/game/`: `particle.png` (64×64 radial spark) and `ground.png` (512×512
  tileable value-noise floor with a faint grid). Regenerate with `pnpm gen:assets`;
  the script prints each output's sha256 (expected hashes documented in its header).
- **Rationale:** no large opaque binaries in the repo, byte-reproducible from
  source, reviewable as code. The renderer consumes them via `@babylonjs/core`
  `Texture` (`ground.png` tiled ×6 on the floor material, `particle.png` on the
  death-burst particle system).
