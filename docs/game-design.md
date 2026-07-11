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

- **Arena:** `ARENA = { spawnRadius: 34, killRadius: 1.6 }` — a large top-down
  field an enemy takes many seconds to cross. Roster `speed` values are tuned so
  the straight-line travel time `spawnRadius / (speed × 60)` sits in a survivable
  band: **regulars 13–45 s, bosses 20–60 s** (asserted in `enemies.test.ts`).
- **Wave size:** `waveEnemyCount(wave) = 3 + wave × 2`.
- **Tier gating:** tiers unlock at waves 1 / 3 / 6 / 10; `tierWeight` shifts the
  spawn mix toward higher tiers as waves climb.
- **Bosses:** every 5th wave has a ~1-in-3 chance to field a boss.
- **Spawn pacing:** `waveSpawnCooldown(wave) = max(30, 100 − wave × 10)` — wave 1
  opens slow (90 ticks between spawns) so the arena never floods before a word can
  be read, tightening to a 30-tick floor by wave 7.
- **Caps & timing:** `MAX_ALIVE = 8` (soft, wave director), `ALIVE_HARD_CAP = 16`
  (absolute, includes ability-spawned minions), `INTERMISSION_TICKS = 180`,
  `INITIAL_INTERMISSION_TICKS = 60`.

## Motion physics

Source: `src/lib/game/sim/physics.ts` (pure, `dist`/`sqrt` only). Each enemy
carries a velocity (`EnemyState.vel`); movement behaviours emit a **desired**
velocity that the physics layer integrates with inertia so the horde moves like
bodies with mass rather than teleporting dots.

- **`steer(e, desired)`** — bends `vel` toward `desired`, capped at `PHYS.accel`
  (0.006) per tick, so nothing reverses or turns instantly.
- **`separate(enemies)`** — pairwise crowd separation: bodies closer than 55% of
  their combined size shove each other apart (O(n²), n ≤ `ALIVE_HARD_CAP`).
- **`applyKnockback(e, awayFrom, mult)`** — a completion hit adds an outward
  impulse (`PHYS.knockback` 0.35); bosses recoil at `mult 0.4`.

`step.ts` runs steer → separate → integrate (`pos += vel × moveScale`, so
freeze/slow scale the whole step) → core-collision each tick.

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
  hash (e.g. the `hits` counter, the roster speed retune, or the enemy `vel`
  field + physics) — an unexpected hash drift is a bug.
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

## Rendering & premium visuals

The render layer (`src/lib/game/render/`) is a Babylon adapter driven by the
loop, kept strictly separate from the pure sim. Key pieces:

- **Camera / arena** (`scene.ts`): a near-vertical top-down `ArcRotateCamera`
  (beta 0.12, radius 55) over a 38-unit textured floor disc, with a fullscreen
  nebula background `Layer` filling the corners and a `GlowLayer` (intensity 0.6,
  blur kernel 16) blooming gameplay emissives (floor and word plates excluded).
- **Player turret** (`turret.ts`): a layered build — sunk base, pulsing energy
  core, barrel assembly that lerp-tracks the locked target — plus a core danger
  ring at the defensive perimeter that flares red as the horde presses within 6
  units. Exposes `getMuzzle()` for shot origins and `ringPulse()` for powerups.
- **Projectile tracers + muzzle flash** (`effects.ts`): pooled emissive beams;
  the loop diffs each enemy's `typedCount`/`hp` per frame to fire a thin bolt on a
  keystroke and a heavier bolt + flash on a completion/kill. Also owns the pooled
  death-burst particle system and the screen shake.
- **Sculpted enemies** (`enemy-models.ts` + `enemy-renderer.ts`): one distinct
  multi-part model per family (husk spikes, darter arrowhead, wraith ring, charger
  wedge, weaver twin-orbs, brood bumps, boss flagship + orbiting shards), tinted
  per tier, scaled ×2.2 for top-down readability, animated render-side (bob / spin
  / heading-orient / sub-part orbit) from the sim tick and a per-id phase.
- **Label plates** (`label.ts`): a rounded dark plate with a thin accent border
  behind each word so it stays legible over the terrain; the locked target's plate
  is larger with a brighter border.

All render work is pooled with reused scratch vectors — no per-frame allocation —
keeping the keystroke round-trip well under the 16 ms budget with glow active.

## Asset pipeline

Two provenance scripts, both **manually run**; CI never calls the network. The
committed PNGs under `public/game/` are the artifacts of record.

- **AI-generated environment** (`scripts/gen-ai-assets.mjs`): calls OpenRouter's
  image-capable Gemini model (`google/gemini-3.1-flash-image`) to produce
  `terrain.png` (tileable dark hex-grid sci-fi floor with teal circuitry) and
  `nebula.png` (dark indigo/violet starfield). Run with
  `OPENROUTER_API_KEY=… node scripts/gen-ai-assets.mjs`, then eyeball the output
  and keep or re-roll. The key is never committed and the network is never touched
  from tests/CI. (Gemini may return JPEG bytes under the `.png` name; browsers
  decode by content so the texture loads correctly.)
- **Generated-procedural sprites** (`scripts/gen-assets.ts`): a zero-dependency,
  seeded (`SEED = 0x9e3779b9`) node script with a hand-rolled RGBA PNG encoder,
  emitting `particle.png` (radial spark, used by the death-burst system). It also
  emits `ground.png`, now superseded by the AI `terrain.png` for the floor.
- **Rationale:** the AI textures give a premium, hand-authored look no procedural
  recipe matched in the playtest, while provenance stays reproducible and the repo
  never depends on a network call at build time.
