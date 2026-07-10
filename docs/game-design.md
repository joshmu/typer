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

## Next phases

Sim depth (waves, combat, powerups, combo score) → 30+ enemy roster → render polish +
asset-pipeline decision gate → persistence, ModeSelector entry, docs finish. See spec §11.
