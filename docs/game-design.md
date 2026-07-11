# Horde Mode — Game Design & Architecture

Status: walking skeleton (spec: `docs/superpowers/specs/2026-07-11-horde-typing-game-design.md`)

## Layers

- `src/lib/game/sim` — pure fixed-timestep simulation (60Hz ticks, seeded rng, `step()` sole mutator)
- `src/lib/game/content` — data-driven enemy archetypes + word banding
- `src/lib/game/render` — Babylon adapter (lazy-loaded with the `/game` route)
- `src/components/game` — Solid shell: HUD, overlays, keyboard capture

## Determinism

Same seed + same `{tick,key}` log ⇒ identical `stateHash`. Golden fixtures live in
`src/lib/game/sim/__fixtures__`. Test hooks: `/game?seed=N&testMode=1` freezes the loop
and exposes `window.__game.{getState,sendKeys,stepTicks}`.

## Visual regression

`e2e/game.spec.ts` snapshots a deterministic frame (fixed seed, fixed tick count).
Baseline is darwin-only while skeleton visuals churn; the linux CI baseline is added at
visual-freeze (render polish phase), after which the snapshot gates CI.

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

## Asset pipeline (Plan 4)

- **Decision:** game textures are **generated-procedural**, not binary art or glTF.
  `scripts/gen-assets.ts` is a zero-dependency, seeded (`SEED = 0x9e3779b9`), idempotent
  node script that hand-rolls a minimal RGBA PNG encoder (filter 0, `node:zlib` deflate,
  inline CRC32) and emits the committed outputs under `public/game/`:
  `particle.png` (64×64 radial spark) and `ground.png` (512×512 tileable value-noise
  floor with a faint grid). Regenerate with `pnpm gen:assets`; the script prints each
  output's sha256 and the expected hashes are documented in its header.
- **Rationale:** no large opaque binaries in the repo, byte-reproducible from source,
  and reviewable as code. The renderer consumes them via `@babylonjs/core` `Texture`
  (`ground.png` tiled ×6 on the floor material, `particle.png` on the death-burst
  particle system).
- **Visual determinism:** async PNG decode is gated in the visual E2E via
  `window.__game.texturesReady()` so the deterministic frame never races the loader.

## Next phases

Sim depth (waves, combat, powerups, combo score) → 30+ enemy roster → render polish +
asset-pipeline decision gate → persistence, ModeSelector entry, docs finish. See spec §11.
