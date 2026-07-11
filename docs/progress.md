# Typer v2 — Build Progress

## Phase 0: Scaffolding

- [x] Step 0.1: Remove v1 artifacts
- [x] Step 0.2: Scaffold Vite + SolidJS + TypeScript
- [x] Step 0.3: Configure Tailwind CSS v4
- [x] Step 0.4: Configure @solidjs/router + directory structure
- [x] Step 0.5: Configure Biome + commitlint + husky
- [x] Step 0.6: Configure Vitest + Playwright
- [x] Step 0.7: GitHub Actions CI pipeline
- [x] Step 0.8: Vercel deployment + progress doc

## Phase 1: Core Typing Experience

- [x] 1.1: Type definitions + test fixtures
- [x] 1.2: Text normalizer (TDD)
- [x] 1.3: processKeystroke() (TDD)
- [x] 1.4: Calculation functions (TDD)
- [x] 1.5: TypingTest container + keydown handler
- [x] 1.6: TextDisplay + word-level rendering
- [x] 1.7: Caret component
- [x] 1.8: Text input modal (custom paste)
- [x] 1.9: Stats bar + completion detection
- [x] 1.10: E2E test + performance validation

## Phase 2: Results & Polish

- [x] 2.1–2.2: Core calculations (consistency, breakdown)
- [x] 2.3: Dexie.js persistence
- [x] 2.4: User preferences
- [x] 2.5: Theme engine
- [x] 2.6: ResultsScreen
- [x] 2.7–2.8: Animations + WPM chart
- [x] 2.9: History + personal bests
- [x] 2.10: UX polish
- [x] 2.11: Theme picker

## Phase 3: Test Modes & Settings

- [x] 3.1: Timer infrastructure
- [x] 3.2: Word count mode
- [x] 3.3: Word generation system
- [x] 3.4: Quote mode
- [x] 3.5: Zen mode
- [x] 3.6: Test mode selector UI
- [x] 3.7: Caret style settings
- [x] 3.8: Sound on keypress
- [x] 3.9: Settings page
- [x] 3.10: Live WPM display toggle

## Phase 4: Book Mode & Hardening

- [x] 4.1: Book mode (Standard Ebooks integration)
- [x] 4.2: Progressive error colors (warning → error)
- [x] 4.3: Diacritics-aware character matching (NFD decomposition)
- [x] 4.4: Book resume at exact word position
- [x] 4.5: Backwards-compatible DB error recovery
- [x] 4.6: Book title in history results
- [x] 4.7: Default to book mode
- [x] 4.8: Pre-commit hook (typecheck + lint)
- [x] 4.9: Commitlint CI validation + book scope

## Horde Game Mode (v3.1)

- [x] Walking skeleton: /game route, deterministic sim + replay hash, Babylon arena, E2E smoke + visual snapshot
- [x] Sim depth: waves, combat, powerups, combo scoring
- [x] Content breadth: 30-archetype roster (6 families × 4 tiers + 6 bosses), tier-gated spawner
- [x] Render polish + generated-procedural asset pipeline (`scripts/gen-assets.ts`)
- [x] Persistence: `gameRuns` (db v4), `saveGameRun` once per run, best-run / recent queries
- [x] Start + death screens with derived run stats (WPM, accuracy) and NEW BEST surfacing
- [x] App integration: Horde entry in mode selector + header nav
- [x] Docs: gameplay reference, determinism/replay guide, perf budgets, asset pipeline

### Premium visual + physics overhaul (playtest response)

- [x] True top-down camera (beta 0.12) + 70%-larger arena (spawnRadius 34, killRadius 1.6) with survivable wave pacing (`waveSpawnCooldown`)
- [x] Deterministic motion physics: steering/inertia, crowd separation, knockback (`sim/physics.ts`, enemy `vel`)
- [x] Rotating player turret with keystroke projectile tracers + muzzle flash (`render/turret.ts`, pooled tracers in `render/effects.ts`)
- [x] Sculpted per-family multi-part enemy models with idle animation (`render/enemy-models.ts`)
- [x] AI-generated terrain + nebula textures (OpenRouter/Gemini, `scripts/gen-ai-assets.mjs`), glow layer, core danger ring
- [x] Word label plates + HUD combo emphasis; darwin visual baseline rebaselined

### Combat feel & battlefield persistence (Plan 7, round-2 playtest)

- [x] Word chains assigned at spawn: `EnemyState.words[]` + `wordIndex` (`words.length === hp`), `currentWord()`, `advanceWord` appends on absorb (`reassignWord` deleted); golden fixtures re-recorded
- [x] Free-flow ZType routing in `step.ts`: continue lock → nearest re-route (progress preserved) → cloaked-ignore → miss; Backspace release event wired through GameShell (preventDefault) + `window.__game.sendBackspace`
- [x] Stacked word-chain labels: current word + queued (55%/40%) + "+n" chip, 0.92 plate + 3px text outline (bright-glow washout fix), progress underline + active chevron
- [x] Turret aims (atan2 + slerp, holds heading, no idle spin) with hex base, cooling fins, twin recoiling barrels, radar sweep, combo-scaled core
- [x] Per-family locomotion gaits driven read-only by sim state (`|vel|`-scaled amplitude, dash-phase sync)
- [x] Corpse/breach decals baked into a ground `DynamicTexture` (Crimsonland technique) — zero live entities, unbounded accumulation
- [x] E2E: free-flow switch/return + Backspace release specs; docs (routing model, gait table, decal bake); darwin baseline rebaselined
