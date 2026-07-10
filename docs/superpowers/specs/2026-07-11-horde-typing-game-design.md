# Horde Mode — Crimsonland-Style Typing Game (Design Spec)

Date: 2026-07-11
Status: Approved for implementation (autonomous goal directive)

## 1. Concept

A premium arcade game mode for Typer inspired by Crimsonland's "Typ'o'shooter" variant:
the player sits at the centre of an arena; waves of enemies close in from all sides.
Every enemy carries a word. Typing a word locks the enemy as the target; completing it
fires a shot that kills (or damages) it. Mis-keys break the streak. Survive waves,
chain kills for combo multipliers, grab word-labelled power-ups. Death ends the run;
score, WPM, accuracy and wave reached are recorded.

Route: `/game` (new page, lazy-loaded). Name in UI: **Horde**.

## 2. Goals & Non-Goals

Goals
- Premium feel: Babylon.js rendered arena, particles, screen shake, juice.
- 30+ distinct enemy types (data-driven archetypes × behaviours).
- Deterministic simulation → replay tests byte-for-byte reproducible.
- Playwright visual regression on deterministic frames.
- Keystroke-to-shot latency well under one frame; sim step budget < 4ms.
- Asset pipeline: procedural/generated assets, no large binaries in git.
- Documented: architecture doc + this spec + gameplay doc.

Non-Goals (YAGNI)
- Multiplayer, leaderboard server, mobile touch controls, gamepad.
- Player movement (Crimsonland typing variant keeps player static — typing IS the gun).
- Audio beyond existing `src/lib/sound.ts` hooks (extend, don't rebuild).

## 3. Architecture

Three strict layers, mirroring the existing "pure core" rule:

```
src/lib/game/            # PURE TypeScript simulation. No Babylon, no DOM, no Date.now.
  sim/                   #   fixed-timestep state machine (tick = 1/60s simulated)
    rng.ts               #   seeded PRNG (mulberry32) — sole randomness source
    state.ts             #   GameState type + createInitialState(seed)
    step.ts              #   step(state, events[]) -> state   (pure, exhaustive)
    spawner.ts           #   wave director: what spawns when, from enemy table
    targeting.ts         #   word prefix matching -> target lock (reuses isCharMatch)
    combat.ts            #   damage, death, splits, on-death effects
    powerups.ts          #   freeze / bomb / heal / slow — word-triggered
    score.ts             #   combo, multiplier, score
    replay.ts            #   InputLog record/replay + stateHash(state)
  content/
    enemies.ts           #   30+ enemy archetype table (data, not code)
    words.ts             #   difficulty-banded word assignment (reuses core/text)
  render/                # Babylon adapter. Reads sim state, never mutates it.
    scene.ts             #   engine/scene/camera/lights bootstrap
    enemy-renderer.ts    #   mesh pool + per-archetype visual recipe
    effects.ts           #   particles, muzzle flash, shake
    labels.ts            #   word labels (typed prefix highlight) via DynamicTexture
    loop.ts              #   rAF driver: accumulator, interpolation, degraded-tab guard
src/components/game/     # Solid shell: HUD, start/death screens, keyboard capture
src/routes/Game.tsx      # lazy route
scripts/gen-assets.ts    # asset pipeline: generates texture atlas + palette json
```

Key rules
- `src/lib/game/sim` and `content` import nothing from Babylon/Solid/DOM. Vitest-only testable.
- All randomness through injected RNG; all time through tick count. `step` is the ONLY state mutator.
- Render layer is disposable: kill the Babylon scene, sim continues (headless mode = tests).
- Babylon (`@babylonjs/core` 9.x, tree-shaken ES modules) is imported ONLY inside
  `render/` + `routes/Game.tsx` dynamic import → main-app bundle unchanged.

## 4. Determinism & Replay

- `InputLog = { seed, events: [{tick, key}] }`.
- `runReplay(log): GameState` — pure fold of `step` over ticks.
- `stateHash(state)`: FNV-1a over canonical serialisation (reuses `core/text/hash` approach).
- Test fixtures: recorded logs committed as JSON + expected final hash + expected
  score/wave. Any sim change that alters behaviour fails loudly; intentional changes
  re-record via `scripts/record-replay.ts`.
- Render never feeds back into sim. Keyboard events are stamped with the NEXT tick.

## 5. Enemy Roster (30+)

Data-driven: `EnemyArchetype = { id, name, hp, speed, size, movement, onDeath?, ability?, tier, wordBand, visual }`.
Movement behaviours (composable pure functions): `chase`, `zigzag`, `orbit-then-dive`,
`dash-pause`, `flank`, `spiral`. Abilities: `split(n)`, `shield(hits)`, `cloak(interval)`,
`spawn(minion, rate)`, `heal-aura`, `enrage-at-half`, `teleport`, `armored(front)`.
Roster = 24 regular (6 families × 4 tiers: grunt/runner/brute/stalker/spitter/swarm-mother
style) + 6 bosses (multi-word: kill = type 3–5 words in sequence) ≥ 30 total.
A unit test asserts `ENEMIES.length >= 30` and uniqueness/validity of every entry.

## 6. Word Assignment

- Bands by tier: short common words (tier 1) → long/rare words (tier 4), boss = word chains.
- Constraint: no two live enemies share a first letter *when possible* (Typing of the Dead
  rule) — resolver picks from band excluding active initials; falls back gracefully.
- Reuses `src/lib/core/text/words.ts` list + `isCharMatch` for diacritics.

## 7. Rendering & Performance

- Fixed sim tick 60Hz via accumulator; render interpolates positions between ticks.
- Mesh instancing/pooling: one master mesh per visual recipe, thin instances or clones
  from pool; word labels via pooled `DynamicTexture` planes (billboard).
- Budgets: sim step < 4ms worst wave; draw calls < 150; route chunk (Babylon) lazy;
  main-app bundle delta ≈ 0. Probes: Vitest perf test (step 1000 ticks max-wave under
  budget on CI with generous margin), Playwright trace probe reusing `e2e/performance.spec.ts`
  patterns.
- Keystroke path: keydown → enqueue event → applied next tick → visual ack same frame
  (target highlight advances immediately via optimistic prefix state in HUD layer).

## 8. Testing Strategy

| Layer | Tool | What |
|---|---|---|
| sim/* | Vitest TDD | every module red-green; property-ish tests for targeting |
| replay | Vitest | fixture logs → exact hash + score |
| content | Vitest | roster ≥ 30, schema validity, word bands non-empty |
| E2E | Playwright | smoke: route loads, canvas present, type kills first enemy, death screen |
| Visual | Playwright screenshots | fixed seed + `?testMode=1` (sim auto-steps N ticks, freezes) → `toHaveScreenshot` with masked HUD dynamics |
| Perf | Vitest + existing perf spec | step budget; keystroke latency probe |

`?seed=…&testMode=1` query params: deterministic start, disables rAF jitter by stepping
a fixed number of ticks then pausing — this is the walking-skeleton probe hook.

## 9. Asset Pipeline

`scripts/gen-assets.ts` (run via `pnpm gen:assets`, output committed, script is source of
truth): generates `public/game/atlas.png` + `atlas.json` (enemy glyph sprites drawn
procedurally with node-canvas-free approach: SVG → data-URI rasterised at build, or pure
procedural vertex-colour meshes if atlas proves unnecessary in skeleton phase).
Decision gate at skeleton review: if procedural materials look premium enough, atlas is
dropped (YAGNI) and pipeline doc records that decision.

## 10. Data & Integration with Typer

- New Dexie table `gameRuns` (score, wave, wpm, acc, seed, duration, ts) — db version bump.
- Game WPM/accuracy reuse `core/calc`.
- ModeSelector gains "Horde" entry linking to `/game`.
- Commitlint: add scope `game`.
- App-wide observations to fold in: none blocking; candidates recorded in progress doc
  (About page thinness, ModeSelector growth). Keep out of game commits.

## 11. Delivery Plan (tracer bullet first)

1. **Walking skeleton** (traceur): route + lazy Babylon scene + 1 enemy archetype +
   typing kills it + death + E2E smoke + replay test of a 3-kill log + visual snapshot.
   Every layer touched end-to-end before ANY breadth.
2. Sim depth: spawner/waves, combat, powerups, score, full targeting rules.
3. Content breadth: 30+ roster + word bands + bosses.
4. Render polish: effects, labels, juice, perf probes.
5. HUD/screens, Dexie persistence, docs (`docs/game-design.md`), final review.

Code review (`/code-review`) after skeleton (step 1), after sim depth (step 2-3), and
before final merge. `/codex` delegated for parallelisable implementation chunks.

## 12. Risks

- Babylon bundle weight → mitigated: lazy route + tree-shaken imports, budget asserted in CI build check.
- DynamicTexture label cost → pooled, updated only on prefix change.
- WebGL in CI Playwright → chromium `--use-gl=swiftshader` fallback; visual tests tolerate software raster via own snapshot baseline.
- Determinism drift from float ops → single-threaded fixed-order sim, no trig from
  render feeding back; hash tests catch drift immediately.
