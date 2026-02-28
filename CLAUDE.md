# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Typer is a touch-typing web app for practicing with custom text. Tracks WPM, accuracy, and progress. **v1** (tag `v1.0.0`, branch `v1`) is legacy AngularJS 1.x. The **`main` branch** is the v2 full rewrite.

## v2 Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | SolidJS + Vite + @solidjs/router |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 + CSS custom properties (themes) |
| Animation | motion/dom (vanilla) + CSS transitions (caret) |
| State | SolidJS signals + stores (built-in) |
| Testing | Vitest (unit/component) + Playwright (E2E) |
| Linting | Biome (lint + format) |
| Data | Dexie.js v4 (IndexedDB) + @solid-primitives/storage (localStorage) |
| Deployment | Vercel |

## Commands (v2)

```bash
pnpm dev              # Start Vite dev server
pnpm build            # Production build
pnpm test             # Vitest watch mode
pnpm test:run         # Vitest single run
pnpm test -- path     # Run single test file
pnpm test:e2e         # Playwright E2E tests
pnpm lint             # Biome lint
pnpm format           # Biome format
pnpm typecheck        # tsc --noEmit
```

## v2 Architecture

Flat project structure (no monorepo). Path alias `@/` → `src/`.

```
src/
  components/
    typing/           # TypingTest, TextDisplay, Caret
    results/          # ResultsScreen, StatsCard, WPMChart
    settings/         # ThemePicker, TestConfig
    layout/           # Header, Footer
  lib/core/           # Pure TypeScript — zero framework deps
    engine/           # Typing engine state machine
    calc/             # WPM, accuracy, consistency
    text/             # Text processing, word lists
    types/            # Shared types
  routes/             # @solidjs/router pages
  styles/             # Tailwind config, themes
e2e/                  # Playwright tests
```

### Key Architecture Rules

- **Typing engine (`src/lib/core/`) is pure TypeScript** — no SolidJS imports, no DOM. All engine functions are pure and testable with Vitest alone.
- **O(1) keystroke processing** — cursor-based, not broadcast. Only the current character's DOM node updates per keystroke.
- **Word-level rendering** — render `<span>` per word, update character CSS classes imperatively. Do NOT create a reactive component per character.
- **Caret positions pre-computed at render time** — never read `offsetLeft`/`offsetTop` during keystroke handling.
- **WPM/accuracy computed inline** on the main thread — it's nanosecond math, never offload to Web Workers.
- **No `requestIdleCallback`** for deferred work during typing — it won't fire during sustained input. Use throttled `rAF` or `setTimeout`.

### Performance Constraint

Every keystroke must process in **<16ms** (one frame at 60fps). See `docs/performance-guide.md` for the full hot path specification.

### Data Layer

- **Dexie.js v4** for typing results (IndexedDB). Reactive queries via `liveQuery` + SolidJS `from()`. Skip `solid-dexie` (unmaintained).
- **@solid-primitives/storage** (`makePersisted`) for user preferences in localStorage.

### Themes

CSS custom properties (`--bg`, `--text`, `--primary`, `--error`, `--caret`) swapped via `data-theme` attribute. Dark mode is the default.

## v1 Reference (branch `v1`)

AngularJS 1.x + Grunt + Bower + node-webkit. Broadcasts every keypress to all 1200+ character directives (O(n)). Build: `grunt dist-mac`. Tests: `npx karma start --single-run`.

## Detailed Docs

See `docs/` for full specifications:
- `docs/architecture.md` — project structure, engine design, data strategy
- `docs/tech-decisions.md` — ADRs with options considered and rationale
- `docs/roadmap.md` — phased delivery plan (Phase 0–3)
- `docs/performance-guide.md` — keystroke hot path, rendering rules, bundle budgets
- `docs/competitive-analysis.md` — Monkeytype, Keybr, TypeRacer comparison
