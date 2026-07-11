# Horde Mode — Premium Visual + Physics Overhaul (Plan 6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address playtest verdict ("no bullets, no character assets, no terrain, basic pixels; should be top-down; map too small"): true top-down camera, 70%-larger arena with 15–20s enemy travel, physics-based motion (steering, separation, knockback), projectile tracers + rotating player turret, sculpted multi-part enemy models with idle animation, AI-generated terrain/nebula textures via OpenRouter, glow layer, label plates.

**Architecture:** Sim gains a deterministic motion-physics layer (velocity/steering/separation/knockback — `dist`/`sqrt` math only). All rendering work stays in `src/lib/game/render/`. AI asset generation is a curated, manually-run script (`scripts/gen-ai-assets.mjs`) with committed outputs — CI never calls the network.

**Verification loop (MANDATORY for every visual task):** after implementing, run the screenshot probe (below), READ the images, and iterate until the task's composition checklist passes. Do not mark a visual task done from green tests alone — the playtest failure happened precisely because nobody looked.

```bash
# probe: writes -start/-play/-play2 PNGs; run from repo root (needs repo node_modules)
cp docs/superpowers/plans/assets/shot.mjs ./.shot.tmp.mjs 2>/dev/null || true  # create per Task 0
node ./.shot.tmp.mjs /tmp/horde && open? no — Read the PNGs with the Read tool
```

## Global Constraints

- Sim/content: deterministic math only (`dist`, `sinR`, `cosR`, `randomPointOnCircle`, `+ - * / Math.sqrt/imul/min/max/floor`); `determinism.test.ts` scan stays green; TDD; fixture re-records batched per task via `RECORD_FIXTURE=1`.
- Render: deep Babylon imports; pooling (no per-frame allocations: reuse Vector3s, pooled meshes/particles); keystroke visual ack same frame; game keystroke E2E p95 budget must stay green.
- Every commit: `pnpm typecheck && pnpm lint && pnpm test:run` green. Commits `type(game): …` + trailer:

  ```
  Claude-Session: https://claude.ai/code/session_01N1YqXkNqwh76TbQtmr9DRC
  ```

---

### Task 0: Screenshot probe script (committed tooling)

Create `scripts/visual-probe.mjs` (committed; imports `@playwright/test` from repo): opens `http://localhost:3000/game?seed=42` (assumes dev server; start it), viewport 1440×900, captures `probe-start.png` (start screen), presses a key, waits 5s → `probe-play.png`, waits 6s more → `probe-late.png`, into a `--out` dir (default `.probe/`, gitignored). Collects console errors + failed requests, prints JSON. Add `.probe/` to `.gitignore`. Commit `chore(game): add visual probe script`.

---

### Task 1: Top-down camera + large arena + survivable pacing

**Sim (`state.ts`, roster, spawner):**
- `ARENA = { spawnRadius: 34, killRadius: 1.6 }` (travel at tier-1 speed 0.04/tick ≈ 14 s; verify per-family: tier-1 regulars must take ≥ 13 s, bosses ≥ 20 s — retune roster `speed` values that violate this, TDD a content test asserting the bounds: `spawnRadius / (speed * 60)` within [13, 45] s for regulars, bosses slower).
- Wave-1 grace: first wave spawnCooldown 90 (currently 45) — add `waveSpawnCooldown(wave)` in spawner (min 30, starts 90, -10/wave), TDD.
- Re-record fixtures once at task end.

**Render (`scene.ts`):**
- Camera: `beta = 0.12` (near-vertical top-down), `radius` sized so the arena spans ~90% of viewport height at 1440×900 (compute: disc radius 38 → camera radius ≈ 55 with fov default; verify by probe).
- Ground disc radius 38.
- E2E: game probes use `stepTicks`, unaffected by pacing; death-screen drive loop cap may need raising (longer survival) — adjust bounded loop, keep <60s.

**Checklist (probe):** arena reads as a flat top-down field filling the frame; enemies enter from edges with visible distance to cover; player centered.

Commit: `feat(game): top-down camera, larger arena and survivable wave pacing`

---

### Task 2: Deterministic motion physics

**Files:** `src/lib/game/sim/physics.ts` (+test), `state.ts` (EnemyState + `vel: Vec2`), `step.ts`, `combat.ts` (knockback), `movement.ts` (unchanged signatures — behaviours now emit DESIRED direction; physics integrates).

```ts
// physics.ts (pure, dist/sqrt only)
export const PHYS = { accel: 0.006, maxTurnDot: /* not needed if accel-based */ 0, sepStrength: 0.02, knockback: 0.35 } as const;
export function steer(e: EnemyState, desired: Vec2): void; // vel += clamp(desired*speed - vel, accel); mutates draft enemy
export function separate(enemies: EnemyState[]): void; // pairwise push when dist < (sizeA+sizeB)*0.55; O(n²), n ≤ 16
export function applyKnockback(e: EnemyState, awayFrom: Vec2, mult?: number): void; // vel += normalized(e.pos - awayFrom) * knockback * mult
```

- `step.ts` movement loop: `const desired = MOVEMENTS[e.movement](e, tick)` (per-tick displacement it already returns becomes the desired velocity), then `steer`, then after the loop `separate(alive)`, then integrate `pos += vel`, then collision check.
- `combat.ts`: on non-fatal completion damage → `applyKnockback(e, {x:0,y:0})` (pushed away from player); bosses `mult 0.4`.
- Feel constraints tested: enemy cannot reverse instantly (vel continuity), separation keeps two same-size enemies from overlapping > 45% of combined radius after 60 settle ticks, knockback moves target ≥ 1.5 units net over 30 ticks.
- `vel` in fixed key order for hash stability. Re-record fixtures once. E2E death-drive loop re-check.

**Checklist (probe):** clumps spread naturally, damaged enemy visibly recoils.

Commit: `feat(game): add deterministic steering, separation and knockback physics`

---

### Task 3: Player turret + projectile tracers + muzzle flash

**Files:** `render/turret.ts` (new), `render/effects.ts`, `render/loop.ts`, `scene.ts` (remove static player cone).

- Turret: layered build at origin — base disc, rotating barrel assembly (box barrel + emissive tip), inner core sphere pulsing. Rotates (render-side lerp, ~0.25/frame) to face `targetId`'s interpolated position; idles slow-spinning when no target.
- Tracers: pooled set (~16) of thin stretched emissive boxes/capsules. Trigger derivation in `loop.ts`: target's `typedCount` increased since last frame → `fireTracer(from muzzle tip, to enemy pos)` — animate over ~4 frames (scale/fade). Word completion (enemy hp drop or death) → thicker bolt + muzzle flash (brief point light or emissive plane burst ≤ 3 frames).
- Powerup activation → radial ring pulse from player.

**Checklist (probe during typing — extend probe to type the first enemy's word via testMode page in a second pass):** every keystroke shows a visible shot; completion visibly heavier; turret faces the target.

Commit: `feat(game): add rotating turret with keystroke tracers and muzzle flash`

---

### Task 4: Sculpted enemy models + idle animation

**Files:** `render/enemy-models.ts` (new), `enemy-renderer.ts` (consume), `visuals.ts` (extend recipe: `parts` config).

Per-family multi-part builds (Babylon `MergeMeshes` into ONE master mesh per family+tier tint via instance color where possible; else pooled clones):
- husk: faceted icosphere + 6 radial spikes (scaled cones)
- darter: flattened elongated tetra/arrowhead + twin fins
- wraith: torus ring + floating inner core sphere (core bobs)
- charger: broad wedge + dorsal ridge boxes
- weaver: two orbs bridged by thin cylinder, orbiting slowly
- brood: central orb + 4 child bumps (spheres)
- bosses: 2× scale flagship of family + orbiting shard ring (3 small tetras, render-side orbit)

Idle animation render-side per frame from `tick` + id phase: gentle bob (`y = base + sin(t·f + φ)·0.15`), slow yaw for non-directional families; darter/charger orient along velocity (`vel` now in state). Cloaked → visibility 0.12 + shimmer (alpha flutter). Sizes ×1.8 overall (readable top-down).

**Checklist (probe):** each family silhouette distinct at gameplay zoom; motion feels alive; bosses imposing.

Commit: `feat(game): add sculpted per-family enemy models with idle animation`

---

### Task 5: AI-generated environment assets (OpenRouter) + glow

**Files:** `scripts/gen-ai-assets.mjs` (new), `public/game/terrain.png`, `public/game/nebula.png` (committed, curated), `scene.ts`, `docs/game-design.md` (pipeline section).

- Script: reads `OPENROUTER_API_KEY` from env; POST `https://openrouter.ai/api/v1/chat/completions` with model `google/gemini-3.1-flash-image` requesting: (a) seamless tileable dark sci-fi arena floor texture, hex-grid + subtle circuitry, deep navy/charcoal, 1024×1024; (b) dark nebula starfield, sparse stars, indigo/violet, 2048×1024 equirect-ish. Decode base64 image from response, write PNG. Manual, curated (run → Read the PNGs → keep or re-roll; NEVER in CI; document that outputs are the artifacts of record, script is provenance).
- `scene.ts`: ground uses `terrain.png` (uScale/vScale ~4, faint emissiveTexture same map at low level); add large inverted skydome sphere (or layer) with `nebula.png`; add `GlowLayer` (deep import `@babylonjs/core/Layers/glowLayer`, intensity ~0.6) so emissive parts (labels excluded — check) pop; core danger ring at killRadius (thin torus, pulsing emissive, warning red when enemy within 6 units — render-side).
- Perf: verify game keystroke E2E p95 still green; GlowLayer cost acceptable on swiftshader CI (if visual test times out, reduce glow kernel).

**Checklist (probe):** terrain visibly textured at top-down zoom; backdrop no longer flat black; emissives glow; core ring reads as the thing to defend.

Commit: `feat(game): ai-generated terrain and nebula with glow layer and core ring`

---

### Task 6: Label plates + HUD polish

- `render/label.ts`: draw rounded-rect plate (dark, 70% alpha, 1px accent border) behind text; font 48px bold target / 40px idle; plate width fits text; typed prefix accent unchanged. Label plane scales up 1.25× when targeted.
- HUD: wave banner center-screen pulse on wave start (already partially present — verify against probe), combo meter accent glow at ≥2× multiplier.

**Checklist (probe):** words readable at a glance over any background; target obvious.

Commit: `feat(game): label plates and hud emphasis polish`

---

### Task 7: Rebaseline + docs + ship

1. Regenerate darwin snapshot (`pnpm exec playwright test game.spec.ts --update-snapshots`), READ it, confirm premium composition.
2. Full gate: `pnpm test:run && pnpm typecheck && pnpm lint && pnpm build && pnpm exec playwright test --workers=1`.
3. `docs/game-design.md`: visuals/physics sections + AI asset pipeline provenance; `docs/progress.md` note.
4. Commit + (orchestrator) push, dispatch update-snapshots workflow, commit linux baseline, CI green.

Commit: `docs(game): document premium visual overhaul and ai asset pipeline`
