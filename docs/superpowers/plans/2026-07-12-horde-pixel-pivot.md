# Horde Mode — 2D Pixel-Art Pivot (Plan 8)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Round-3 verdict: the 3D perspective look is wrong for the genre — Crimsonland is flat 2D top-down. Pivot the render layer to orthographic top-down with pixel-art sprites (creature-like walk-animated enemies, marine/turret hero holding last-shot heading), high-contrast persistent death marks, and zero word pop-in.

**Architecture:** Sim untouched EXCEPT the absorb rule (Task 1 — kills word pop-in). Render layer swaps meshes for Babylon `SpriteManager` sprites under an orthographic camera; sprite art comes from a generation pipeline (`scripts/gen-sprites.mjs`: AI-generated via OpenRouter, post-processed + atlas-packed deterministically, procedural pixel fallback). Ground decal bake stays (restyled chunky pixel splats). Labels stay DynamicTexture planes (flat under ortho).

## Global Constraints

- Sim purity/determinism unchanged; TDD for the absorb rule; single fixture re-record if hashes shift.
- Pixel crispness: every sprite/ground texture sampled NEAREST (`Texture.NEAREST_SAMPLINGMODE` / `updateSamplingMode`); no smoothing on decal stamps (`imageSmoothingEnabled = false`).
- MANDATORY probe verification with Read on every visual task; the bar is "reads like a 2D Crimsonland-like".
- Commits `type(game): …` + session trailer; hooks; full end gate.

---

### Task 1 (sim): absorb without word pop-in

Shield/armored-front absorbs currently advance `wordIndex` and append fresh words — the source of "another word shows after completing". New rule: an ABSORBED completion resets `typedCount` to 0 on the SAME word (clang; shieldHits decrement stays). `advanceWord`'s append-on-exhaust path is deleted; invariant hardens to `words.length === archetype.hp` for the enemy's whole life, all visible in the stack from spawn. Update combat.ts + tests (absorb no longer changes the word; multi-hp chains unchanged). Fixture re-record if deep-run shifts.

### Task 2: orthographic top-down camera

`scene.ts`: camera → true overhead ortho (`camera.mode = Camera.ORTHOGRAPHIC_CAMERA`, orthoLeft/Right/Top/Bottom sized to arena ~±40 adjusted to viewport aspect, straight-down view). Remove perspective-dependent tweaks (nebula Layer stays — it's already 2D). Ground plane fills frame edge-to-edge; verify no foreshortening in probe (hex cells uniform across the frame).

### Task 3: sprite pipeline — `scripts/gen-sprites.mjs`

- OpenRouter (`OPENROUTER_API_KEY`, model `google/gemini-3.1-flash-image`) generates per-family creature sprites, PROMPTED AS: "16-bit pixel art sprite, top-down view facing north, [creature brief], centered, plain solid magenta background #FF00FF, 128x128" — one image per request. Family briefs (Crimsonland bestiary vibes): husk=bloated zombie-alien, darter=sleek spider-wasp, wraith=spectral floating horror, charger=armored beetle-brute, weaver=twin-headed spider, brood=egg-sac spider-mother, boss variants=bigger/meaner of each, hero=sci-fi marine/turret gunner seen from above. 2 walk poses per family (limbs shifted) via two generations, plus 1 hero + 1 hero-recoil.
- Post-process in-script (pure node, reuse PNG codec from gen-assets): magenta → transparent (chroma key with tolerance), auto-crop, downscale to 64px NEAREST, quantize to ≤24 colours, pack ALL cells into ONE atlas `public/game/sprites.png` + `sprites.json` manifest (deterministic order/coords).
- CURATE: Read every generated sprite; re-roll ≤3× per cell; if a family can't produce a clean readable sprite, draw it procedurally (pixel-primitive creature painter fallback in the same script) — mixing sources is fine, manifest records provenance.
- Committed outputs; script manual-only.

### Task 4: sprite renderer

- `render/enemy-renderer.ts` (rewrite) + `render/turret.ts` (rewrite): one `SpriteManager` on the atlas (capacity ~64, NEAREST). Enemies = sprites: `angle` = atan2(vel) (sim vel), walk cells alternated by distance-travelled phase, size from archetype × tier, cloak = alpha flutter, bosses scaled ×2 + slow pulse. Hero sprite at origin: `angle` = LAST-SHOT heading — updates ONLY when a tracer fires (or target locked); never re-anchors; recoil cell for 3 frames on fire.
- Tracers/muzzle/death burst: keep additive quads/particles but retexture with tiny pixel-dot sprite; death burst = chunky pixel gibs.
- Delete `enemy-models.ts`, mesh turret internals, `visuals.ts` mesh recipes (keep family→palette map for tints/splats). Labels/powerups: powerup crystal → sprite cell; label planes unchanged.

### Task 5: ground + death marks, pixel pass

- Terrain: regenerate via OpenRouter as "seamless tileable 16-bit pixel art scorched dirt + tech-plate floor tile, top-down, dark palette, 256x256" (curate; fallback: pixelate existing terrain via down/up-scale quantize in-script). NEAREST sampling, tiled.
- Decal splats restyled: chunky opaque pixel blood/goo clusters (family palette, 3-5 blobs, hard edges, no smoothing) ~2× current size — must be CLEARLY visible in a probe after ~10 kills (round-3 complaint: not visible in play). Add an e2e assertion: testMode page, kill 3 enemies via sendKeys, read ground texture pixels via canvas `readPixels`? — impractical; instead probe-verify + keep unit surface at ground-decals stamp math.
- Verify decal visibility IN-BROWSER probe at normal gameplay kill counts, not just mass-kill shots.

### Task 6: e2e, baselines, docs

- Re-baseline darwin + report for linux workflow refresh (orchestrator).
- `docs/game-design.md`: art direction section (2D ortho pixel, sprite pipeline, absorb rule change), progress.md note.
- Full end gate.
