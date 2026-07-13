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

Source of truth: `src/lib/game/content/enemies.ts` (32 archetypes). The roster is
6 regular families × 4 tiers (24) + 2 single-tier locomotion specialists
(`corkscrew-1`, `lunger-1`) + 6 word-chain bosses. Each family owns one movement;
tiers escalate hp/size and layer on abilities.

| Family    | Movement          | Character                                  |
|-----------|-------------------|--------------------------------------------|
| Husk      | `chase`           | straight-line pressure; enrage/heal at high tiers |
| Darter    | `zigzag`          | erratic lateral weaving                    |
| Wraith    | `orbit-then-dive` | circles the core, then commits inward      |
| Charger   | `dash-pause`      | bursts of speed punctuated by pauses       |
| Weaver    | `flank`           | approaches off-axis to flank the core      |
| Brood     | `spiral`          | inward spiral; the `split`/`spawn` minion source (`brood-1`) |
| Corkscrew | `spiral-fast`     | tight fast corkscrew (tier 2, reuses Darter sprite art) |
| Lunger    | `feint`           | sprints in, recoils, then creeps — a jump scare (tier 3, reuses Charger sprite art) |

**Movements** (`MovementId`): `chase`, `zigzag`, `orbit-then-dive`, `dash-pause`,
`flank`, `spiral`, `spiral-fast` (3× angular velocity of `spiral`, steadily
shrinking radius), `feint` (one-way phases via `EnemyState.movePhase`/`phaseTick`:
sprint ×3 → outward recoil ~90 ticks → inward creep ×0.4; knockback can't rewind
a phase).

**Abilities** (`Ability`): `split` (burst minions on death), `shield` (absorbs N
word-completions before taking damage), `cloak` (periodically untargetable),
`spawn` (periodically fields minions), `heal-aura` (heals nearby enemies),
`enrage-at-half` (speeds up below half hp), `teleport` (periodic jump), and
`armored-front` (only exposed within a radius of the core). All eight abilities
and all eight movements are represented across the roster; bosses are tier-4
enemies that type a whole public-domain **sentence** as their chain — `hp` equals
the passage word count, not their nominal archetype hp (see Word bands & chains).

## Word bands & chains

`pickWordForTier(tier, rng, excludeInitials)` draws length-banded words from
`english-1k` (tiers 1–2) and `english-5k` (tiers 3–4). Each enemy is assigned a
**word chain** at spawn (`pickWordChain`, `EnemyState.words`), and `createEnemy`
derives `hp`/`maxHp` from the chain itself: **`words.length === hp === maxHp` is a
universal invariant**, so completing one word deals one damage and `wordIndex`
walks the chain to death. Regulars get an `archetype.hp`-long banded chain (so
their `hp` is unchanged); **bosses** instead type a whole public-domain
**sentence** — a seeded pick from `BOSS_TEXTS` (`content/boss-texts.ts`, ~20
pre-normalized 15–25 word proverbs/pre-1900 passages) via `pickBossText`, whose
length overrides the archetype's nominal hp. The boss passage is picked from the
subset whose first word's initial avoids the field's live initials (fallback: any
passage). Frenzy swarm smalls take a single-letter chain (length 1). The **first**
word obeys the field-uniqueness rule at spawn
(initials of every live enemy **and** active powerup are excluded so the
acquiring keystroke is never ambiguous); later words are drawn at spawn too but
may be redrawn later (see below). `currentWord(e)` is the sole accessor. A
shield/armored-front **absorb** deals no damage and does **not** change the
word — it resets `typedCount` to 0 on the SAME word (a clang), so
`words.length === archetype.hp` is invariant for the enemy's whole life and
completing a word never pops a fresh word into the stack. `advanceWord` (the
only caller is a *damaging* multi-hp/boss completion) KEEPS the pre-assigned
next chain word — the one the player has already been previewing in the label
stack — so the preview is truthful. It redraws that slot in place ONLY when the
word's initial collides with the field's live initials, the sole legitimate
reason to break the preview; either way the array is never grown. **Bosses skip
the redraw entirely** — a boss types a fixed sentence, so word order is sacred and
the initial-uniqueness nicety yields to the passage. `typedCount` is progress
within the current word.

## Targeting model (free-flow routing)

ZType-informed free-flow, implemented in `step.ts`. Per keystroke:

1. **Continue the active lock.** If a powerup (`targetPowerupId`) or enemy
   (`targetId`) is locked and the key matches its next needed char, advance it. A
   mismatch here is **not** a miss — it falls through to re-routing.
2. **Re-route.** Scan every alive, targetable enemy whose next-needed char
   (`currentWord(e)[e.typedCount]`) matches — covering fresh enemies (at their
   initial) **and** previously partial ones (at their saved progress) in one pass;
   the **nearest to the core** wins. Switching keeps the previous target's
   `typedCount` (progress is never reset). Powerups are matched next by the same
   rule. At most one lock is held at a time (enemy XOR powerup).
3. **Cloaked-only ignore.** A key that matches only a hidden-phase cloaker is
   ignored (no miss, no combo break) — unfair to penalise an unseen target.
4. **Miss.** A key matching nothing live is the only miss (breaks combo).
5. **Backspace** (`{ type: "backspace" }`) releases the active lock, keeping all
   typed progress; never a miss. `GameShell` maps the Backspace key with
   `preventDefault` (so the browser never navigates back) via
   `loop.pushBackspace()` / `window.__game.sendBackspace()`.

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
- **Partial completions** award a flat `10 × wordLength` (no combo multiplier). A
  shield/armored absorb resets the SAME word (clang, no new word); a multi-hp/boss
  chip advances to the next pre-assigned chain word.
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
- **Frenzy (swarm) waves:** `GameState.waveKind` is fixed the instant a wave goes
  active. Every 5th wave is `"boss"`; otherwise waves past 3 roll a seeded
  `SWARM_CHANCE` (20%) for `"swarm"`, never two in a row (`lastSwarmWave` guard,
  one `nextFloat` draw per eligible wave-start). A swarm floods the arena with
  single-letter tier-1 smalls: enemy count ×4 (`waveEnemyCount × 4`), spawn
  cooldown `max(10, ⌊waveSpawnCooldown ÷ 3⌋)`, the soft alive cap raised to
  `SWARM_MAX_ALIVE = 12` (hard cap 16 unchanged), the spawn table forced to
  `husk-1`/`darter-1` (seeded 50/50, bosses can never appear), and every chain a
  single a–z letter drawn to avoid live field initials (`pickLetter`). The HUD
  wave chip flips to a red/amber **FRENZY** banner while `waveKind === "swarm"`.
- **Boss waves:** every 5th wave's first spawn fields exactly one boss, which types
  a whole public-domain sentence (`hp` = passage word count; see Word bands &
  chains). While a boss is alive the HUD shows a top-center DOM life bar
  (`boss-bar`): the boss's display name plus a segmented meter (`hp`/`maxHp`, one
  amber segment per remaining word) derived from the first alive boss in the state.

## Perk draft (roguelite)

Source: `src/lib/game/sim/perks.ts` (data + pure helpers) with effects wired where
they act (`combat.ts`, `powerups.ts`, `step.ts`, `spawner.ts`). Perks are
**run-only** — `GameState.perks` resets with the run, no meta-progression.

**Flow.** When a wave's last enemy dies the director enters a new **frozen**
`wavePhase: "perk-choice"` (in place of going straight to intermission) and draws
`GameState.perkOffer`: three distinct, rarity-weighted ids. During perk-choice
`step()` early-returns — no spawning, movement, ability/combo/effect/powerup ticks,
and no key routing or misses; the **only** input that acts is a
`{ type: "perk"; index: 0|1|2 }` event. Applying it owns the perk, clears the
offer, and flips to a normal `intermission` (resetting the wave's free-miss
charge). The initial wave 0→1 intermission never offers a perk. In the shell,
keys **1/2/3** (or a card click) map to the event, and `window.__game.sendPerk(i)`
drives it in tests; a DOM overlay (`perk-overlay`, cards `perk-card-0/1/2`) shows
the three rarity-accented cards, and a bottom-left `perk-strip` lists owned perks.

**Pool (14 perks).** Rarity weights **common 6 / rare 3 / epic 1**, drawn without
replacement so the three cards are distinct; owned non-repeatable perks are
excluded (`plating`/`greed` are repeatable and always eligible; a starved pool is
padded from them).

| rarity | perks |
|--------|-------|
| epic (weapons) | `splash-rounds` (kill → 1 dmg within 6), `piercing-bolt` (kill → 1 dmg to nearest enemy behind the victim, cone dot ≥ 0.5, range 12), `chain-arc` (kill at combo ≥ 10 → 1 dmg to nearest within 10), `heavy-rounds` (knockback ×2; boss recoil 0.4→0.6) |
| rare | `steady-hands` (first miss/wave keeps combo), `sharpshooter` (kill score ×1.5), `overclock` (20-hit streak primes +1 dmg on the next kill), `gravity-well` (enemies within 8 move at 75%), `vampiric` (heal 1 every 15 kills, capped) |
| common | `plating` (+1 max hp & heal 1, **repeatable**), `cryo-mastery` (freeze/slow ×1.5), `adrenaline` (combo decay ×1.5), `scavenger` (powerup every 9 kills), `greed` (+10% score, **repeatable/stacking**) |

**Shared damage path.** `resolveCompletion` and every weapon-perk hit funnel
through `dealDamage(s, e, moveScale)` (absorb → chip+knockback+`advanceWord` →
kill), so shields/armored-front absorb weapon splash exactly like a typed word.
Weapon hits award no score themselves; weapon **kills** run through `killEnemy`
(kills/combo/score as normal). Weapon effects fire **breadth-first from the typed
kill only** — one hop, never re-triggering off a weapon kill — and scan
`s.enemies` in array order (nearest wins ties by array order) for determinism.

**Determinism.** The offer draw threads `s.rngState`; all counters
(`overclockStreak`, `steadyHandsUsedThisWave`, `lastVampiricMilestone`) and the
offer serialize into the state hash. The perk event round-trips the replay fixture
format as `{ tick, perk }` alongside `{ tick, key }`; `buildDeepRunLog` probes the
sim and injects a pick on each perk-choice tick so replays keep advancing waves. A
sim change that shifts the hash requires a fixture re-record (`RECORD_FIXTURE=1`).

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

**Art direction — flat 2D top-down pixel art (Crimsonland-like).** The render
layer is a Babylon adapter driven by the loop, kept strictly separate from the
pure sim. Enemies and the hero are pixel-art **sprites** under a true overhead
**orthographic** camera; there are no 3D creature/turret meshes. Everything is
sampled NEAREST so pixels stay crisp. Key pieces:

- **Camera / arena** (`scene.ts`): a true overhead **orthographic** `ArcRotate`
  camera (beta ~0, alpha -π/2 looking straight down) with the frustum sized to
  ±38 world units vertically and left/right following the viewport aspect so world
  cells stay square (recomputed on resize) — zero foreshortening. A radius-80 floor
  disc fills the frame edge-to-edge (full-bleed battlefield), a fullscreen nebula
  `Layer` sits behind, and a `GlowLayer` blooms gameplay emissives (floor and word
  plates excluded).
- **Sprite atlas** (`sprite-atlas.ts`): ONE shared `SpriteManager` on the
  generated `public/game/sprites.png` (uniform 64px cells, NEAREST) backs every
  on-field sprite — enemies, the hero, powerup crystals. `CELLS` maps names →
  cellIndex, mirroring `sprites.json`.
- **Player hero** (`turret.ts`): a top-down marine/turret **sprite** at the core
  whose heading is the **LAST-SHOT heading** — it snaps toward a target on `fire()`
  and slerps toward a *locked* target in `update()`, and simply **HOLDS** otherwise,
  never re-anchoring to the nearest enemy on its own (explicit playtest feedback).
  A recoil sprite cell flashes for 3 frames per shot. Two flat ground rings survive:
  a powerup activation pulse (`ringPulse()`) and a red danger perimeter that flares
  as the horde presses within 6 units. Exposes `getMuzzle()` for shot origins.
- **Projectile tracers + muzzle flash + gibs** (`effects.ts`): pooled emissive
  beams; the loop diffs each enemy's `typedCount`/`hp` per frame to fire a thin bolt
  on a keystroke, a heavier bolt + flash on a completion/kill, and a dull spark on a
  shield/armored **clang** (a `typedCount` drop with no hp loss). The death burst is
  **chunky opaque pixel gibs** (a hard NEAREST square, family-coloured) plus the
  screen shake.
- **Sprite enemies** (`enemy-renderer.ts`): a `Sprite` per enemy — `angle =
  atan2(sim vel)` so the creature faces its travel direction, two walk-pose cells
  alternated by distance travelled, size from archetype × scale (bosses ×1.6 with a
  slow pulse), cloak = alpha flutter. Sprites are untinted so each family shows its
  own authored art. Six creature families + boss + hero, drawn as 16-bit pixel-art
  creatures (`scripts/gen-sprites.mjs`).
- **Label plates** (`label.ts`): each enemy shows its remaining word chain —
  current word on the bottom plate at full brightness, up to `MAX_STACK` (5) queued
  words stacked above at 70% scale / 75% alpha, and any remainder collapsed into a
  "+n" chip — all baked into one fixed tall texture (four rows) with no
  per-completion reallocation. A long boss **sentence** (15–25 words) reads as the
  current word plus four queued plus a "+n" overflow chip that shrinks as the boss
  is chipped down. The boss's overall progress also shows as a top-center DOM life
  bar (`boss-bar`, one segment per word, amber fill; see HUD). Plate fill alpha 0.92 and a 3px dark `strokeText` outline behind
  every glyph keep the text legible even over a bright bloomed enemy. The active
  target gets a brighter border plate and a chevron; partial enemies get a thin
  amber progress underline. Powerups share the upgraded single-plate path.
- **Battlefield persistence** (`ground-decals.ts`): the ground diffuse (and
  emissive) is a single 2048² `DynamicTexture`, NEAREST-sampled with canvas
  smoothing off. The pixel terrain is baked in once — a centre-square crop scaled
  across the whole floor (no tiling seams, no aspect distortion) — then corpse and
  breach decals are stamped straight in on death frames as **chunky hard-edged
  pixel blood/goo clusters** on a shared pixel grid (a big central pool + satellite
  gouts in the family colour per corpse, a red char pool + gash per breach), ~2× the
  old splats and clearly visible at normal kill counts. `texture.update()` runs only
  when a decal is stamped; there are **zero live decal entities** and accumulation
  is unbounded for free (Crimsonland technique).

All render work is pooled with reused scratch vectors — no per-frame allocation —
keeping the keystroke round-trip well under the 16 ms budget with glow active.

## Asset pipeline

Three provenance scripts, all **manually run**; CI never calls the network. The
committed PNGs under `public/game/` are the artifacts of record.

- **Creature/hero sprites** (`scripts/gen-sprites.mjs`): the pixel-art atlas
  pipeline. Per family it prompts OpenRouter (`google/gemini-3.1-flash-image`) for a
  magenta-background 16-bit top-down sprite, then decode + chroma-key magenta +
  auto-crop + NEAREST downscale to 64px in a headless Chromium canvas (the model
  returns mixed PNG/JPEG bytes pure node can't decode), quantize to ≤24 colours, and
  pack every cell into ONE uniform 64px atlas (`sprites.png` + `sprites.json`
  manifest with per-family provenance) for the Babylon `SpriteManager`. Quantize +
  atlas pack + PNG encode are pure node (encoder mirrors `gen-assets.ts`). Accepted
  cells cache under `.sprites-cache/` (gitignored) so a re-roll of one family never
  regenerates the rest; a procedural pixel-painter fallback covers any family that
  can't produce a clean sprite (plus the procedural dot/crystal cells). Run:
  `OPENROUTER_API_KEY=… node scripts/gen-sprites.mjs [--only fam] [--proc fam]`.
- **AI-generated environment** (`scripts/gen-ai-assets.mjs`): OpenRouter produces
  `terrain.png` (16-bit pixel-art scorched-dirt + tech-plate floor) and `nebula.png`
  (dark starfield backdrop). Eyeball and keep or re-roll. (Gemini may return JPEG
  bytes under the `.png` name; browsers decode by content so the texture loads.)
- **Generated-procedural** (`scripts/gen-assets.ts`): a zero-dependency, seeded
  (`SEED = 0x9e3779b9`) node script with a hand-rolled RGBA PNG encoder, emitting
  `particle.png` and `ground.png` (both now superseded — the death burst uses a
  runtime pixel gib and the floor uses `terrain.png`).
- **Rationale:** AI art gives a hand-authored 2D pixel look no procedural recipe
  matched, while provenance stays reproducible and the repo never depends on a
  network call at build time.
