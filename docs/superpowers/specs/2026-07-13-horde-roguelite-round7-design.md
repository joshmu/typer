# Horde Round 7 — Roguelite Perks, Frenzy Waves, Boss Sentences, New Locomotion

Status: approved (playtest round 7, 2026-07-13)

Five features + one bug fix for the `/game` mode. Everything lands inside the
existing determinism contract: perks, wave kinds, and movements are pure sim
state driven by seeded rng and the event log; the Solid shell only renders
overlays and forwards key events. Replay fixtures are re-recorded once per
sim-changing commit (`RECORD_FIXTURE=1 pnpm test:run -- src/lib/game/sim/replay.test.ts`).

## 0. Bug fix — truthful word preview (ship first)

`advanceWord` (`sim/combat.ts`) currently redraws the next chain word fresh on
every damaging completion, so the queued word shown in the label stack is
replaced by a different random word the moment it becomes current.

**Fix:** keep the pre-assigned `words[wordIndex]`. Redraw (current behaviour)
ONLY when that word's initial collides with `liveInitials(s, e.id)` — the
ambiguity guard is the sole reason to break the preview. `typedCount` still
resets; `words.length === hp` invariant unchanged.

Tests: chip a multi-hp enemy with no colliding initial → `words[wordIndex]`
unchanged from spawn assignment; force a collision → word is redrawn and its
initial avoids the live set.

## 1. Roguelite perk draft — every wave

### Flow

- New `wavePhase: "perk-choice"` entered when a wave's last enemy dies (where
  the sim currently flips to `intermission`). No spawning, no enemy movement
  (field is empty anyway), combo/effect timers freeze during the choice.
- On entry the sim draws **3 distinct perk ids** from the pool (seeded rng,
  rarity-weighted, owned non-repeatable perks excluded) into
  `s.perkOffer: PerkId[]`.
- New event `{ type: "perk"; index: 0 | 1 | 2 }` applies the chosen perk,
  clears the offer, and flips to normal `intermission`. Keys **1/2/3** map to
  the event in `GameShell` (and `window.__game.sendPerk(i)` for tests). All
  other key events are ignored during `perk-choice` (no misses).
- Run-only: `s.perks: PerkId[]` resets with the run. No meta-progression.

### Pool (14 perks, 3 rarities)

Rarity weights: common 6 / rare 3 / epic 1 per draw slot (weighted without
replacement so the 3 cards are always distinct ids).

**Epic — weapons** (change what shots do; each once per run; tracer/impact
visuals change per weapon):

| id | effect |
|----|--------|
| `splash-rounds` | kill detonates: 1 damage to every enemy within 6 units of the victim |
| `piercing-bolt` | kill bolt continues: 1 damage to the nearest enemy within 12 units roughly behind the victim (away from core, dot-product cone ≥ 0.5) |
| `chain-arc` | kill at combo ≥ 10 arcs 1 damage to the nearest other enemy within 10 units |
| `heavy-rounds` | knockback impulse ×2 (bosses ×1.5 of their softened recoil) |

**Rare — typing/utility** (once per run):

| id | effect |
|----|--------|
| `steady-hands` | first miss each wave does not break combo (charge resets on wave start) |
| `sharpshooter` | kill score ×1.5 (rounded down) |
| `overclock` | after 20 consecutive hits without a miss, next damaging completion deals +1 damage (streak visual: gold tracer while primed) |
| `gravity-well` | enemies within 8 units of the core move at 75% speed |
| `vampiric` | every 15 kills heals 1 hp (capped at max) |

**Common — stats** (once per run except the two repeatable fillers):

| id | effect |
|----|--------|
| `plating` | +1 max hp and heal 1 (REPEATABLE — always eligible) |
| `cryo-mastery` | freeze/slow powerup durations ×1.5 |
| `adrenaline` | combo decay window ×1.5 |
| `scavenger` | powerup milestone every 9 kills (from 12) |
| `greed` | score gains +10% (REPEATABLE, additive: 2 stacks = +20%) |

Weapon "extra damage" reuses the existing damage path: extract the
post-absorb portion of `resolveCompletion` into `dealDamage(s, e, moveScale)`
(hp chip → `advanceWord` or `killEnemy`), so shields/armored-front absorb
weapon splash exactly like typed completions. Weapon-triggered kills count for
kills/combo/score like typed kills. Chain/splash resolve breadth-first from the
typed kill only (no recursive re-triggering off weapon kills — one hop).

### Shell overlay

DOM overlay (like start screen) during `perk-choice`: three cards with key cap
`[1] [2] [3]`, perk name, one-line description, rarity accent (common slate /
rare cyan / epic amber glow). Selection instant on keydown. Small "choose your
upgrade" header. No mouse needed; cards clickable as a bonus.

### Weapon feedback (render)

`effects.ts` reads owned weapon perks from the state snapshot: splash = radial
orange burst at victim, pierce = extended cyan lance through the victim, chain
= violet arc segment between victims, heavy = deeper muzzle flash + stronger
shake. Overclock primed = gold tracer tint.

## 2. Frenzy wave (letter swarm)

- `s.waveKind: "normal" | "swarm" | "boss"` set when the wave increments.
  Boss waves (`wave % 5 === 0`) stay boss. Otherwise, waves after 3 roll a
  seeded 20% chance of `swarm` — never two swarms back-to-back
  (`s.lastSwarmWave` guard).
- Swarm wave: enemy count ×4 (`waveEnemyCount(wave) * 4`), spawn cooldown ÷3
  (floor 10 ticks), soft alive cap raised 8 → 12 for the swarm wave only
  (hard cap 16 unchanged), spawn table forced to tier-1 smalls
  (`husk-1`/`darter-1` 50/50).
- Every swarm enemy's chain is a SINGLE LETTER word drawn from `a–z` excluding
  live field initials (≤16 alive keeps letters unique; drawing helper in
  `content/words.ts`).
- HUD: wave banner shows "FRENZY" treatment (existing wave indicator location,
  red/amber accent) while `waveKind === "swarm"`.

## 3. Boss sentence chains + boss hp bar

- New `content/boss-texts.ts`: ~20 curated public-domain passages (proverbs,
  pre-1900 literature), each 15–25 words after normalization (lowercase,
  punctuation stripped, ascii). Stored pre-split as `string[][]`.
- Boss spawn (every 5th wave, first spawn): chain = passage words in order,
  `hp = words.length` (overrides archetype hp). Passage picked seeded from the
  subset whose FIRST word initial avoids live field initials (fallback: any
  passage — field is near-empty at wave start so collisions are rare).
- `advanceWord` on a boss must NOT redraw mid-sentence words (the preview fix
  makes order sacred): bosses skip the collision redraw entirely — sentence
  order wins over the initial-uniqueness nicety for later words.
- **Life status:** DOM HUD bar, top-center, visible while a boss is alive:
  boss display name + segmented bar (`hp / maxHp`, one segment per remaining
  word, thin segments for 20+). Testid `boss-bar`.

## 4. New locomotion — corkscrew + lunger

`EnemyState` gains `movePhase: number` and `phaseTick: number` (deterministic,
serialized in the state hash like everything else).

- **`spiral-fast`** movement: a tight, fast corkscrew — angular velocity ~3×
  the existing `spiral`, radius shrinking steadily; stateless like current
  movements. Archetype `corkscrew-1` ("Corkscrew", darter family art, tier 2,
  hp 1, unlock wave 4, speed tuned so travel lands in the regular 18–55 s
  band despite the longer helical path).
- **`feint`** movement (the jump scare): phase 0 — sprint straight at the core
  at ×3 base speed; on crossing distance 10 → phase 1 — back away outward for
  ~90 ticks (slow retreat, reads as a recoil/hesitation); then phase 2 — creep
  inward at ×0.4 base speed. Phases advance one-way via `movePhase`
  (knockback can't reset them). Archetype `lunger-1` ("Lunger", charger family
  art, tier 3, hp 2, unlock wave 5). Effective travel time must still land in
  the regular band (assert in `enemies.test.ts` with a phase-aware bound).
- Both enter the regular spawn table via `tierWeight` as normal members of
  their tiers. Renderer maps their family art via existing archetype→cell
  lookup (no new sprite art required).

## 5. Testing & rollout

TDD per phase; every sim change re-records replay fixtures in the same commit.
Atomic commits in order:

1. `fix(game): keep pre-assigned chain words so the label queue never lies`
2. `feat(game): corkscrew and lunger enemies with spiral-fast and feint movement`
3. `feat(game): frenzy letter-swarm waves`
4. `feat(game): boss sentence chains with hud life bar`
5. `feat(game): roguelite perk draft between waves`
6. `test(e2e): perk draft + boss bar coverage, refreshed visual baselines`

E2E: keyboard perk pick via `window.__game`, boss bar visibility on wave 5,
FRENZY banner (seed-hunted), visual baselines refreshed darwin + linux
(update-snapshots.yml workflow). CI must be green after each push.

Out of scope: meta-progression, mouse-first UI, new sprite art, sound.
