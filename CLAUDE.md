# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Typer is a touch-typing web app for practicing with custom text. Tracks WPM, accuracy, and progress. **Live:** [typer.joshmu.dev](https://typer.joshmu.dev). **v1** (tag `v1.0.0`, branch `v1`) is jQuery, **v2** (tag `v2.0.0`, branch `v2`) is AngularJS 1.x. The **`main` branch** is the v3 full rewrite.

## v3 Tech Stack

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

## Commands (v3)

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

## v3 Architecture

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

- **Dexie.js v4** for typing results + book progress (IndexedDB). Reactive queries via `safeFrom(liveQuery)` wrapper (src/lib/safe-query.ts) with error fallbacks. Skip `solid-dexie` (unmaintained).
- **@solid-primitives/storage** (`makePersisted`) for user preferences in localStorage.
- **Character matching** uses `isCharMatch()` (src/lib/core/text/char-match.ts) — NFD decomposition allows base chars to match diacritics (e.g., "z" → "ž").
- **Book resume** uses `computeBookResumePosition()` (src/lib/core/engine/book-resume.ts) — computes resume offset from actual typed words, not pre-fetched feeder position.

### Themes

CSS custom properties (`--bg`, `--text`, `--primary`, `--error`, `--caret`) swapped via `data-theme` attribute. Dark mode is the default.

## Development Practices

### TDD (Test-Driven Development)

All new features and bug fixes **must** follow red-green-refactor:
1. **Red** — Write a failing test first
2. **Green** — Write the minimum code to pass
3. **Refactor** — Clean up while keeping tests green

Pure engine functions (`src/lib/core/`) are the primary TDD targets. UI components are tested via E2E (Playwright) when behaviour is user-facing.

### Commits

**Atomic commits** — each commit is a single logical change that passes all checks independently. Never bundle unrelated changes.

**Commitlint** with required scope is enforced via husky `commit-msg` hook:
```
type(scope): description
```
Allowed scopes: `scaffold`, `engine`, `calc`, `text`, `types`, `typing`, `results`, `settings`, `layout`, `theme`, `db`, `prefs`, `ci`, `deploy`, `e2e`, `deps`, `book`

### Git Hooks (husky)

| Hook | Action |
|------|--------|
| `pre-commit` | `pnpm typecheck && pnpm lint` |
| `commit-msg` | `pnpm commitlint --edit $1` |

### CI Pipeline

GitHub Actions runs on push to `main` and PRs: typecheck, lint, commitlint (PRs), unit tests, build, E2E tests. All must pass before merge.

## Browser Validation

Use the `agent-browser` skill for any browser-based validation (visual checks, interaction testing, screenshot comparison). Always define a session: `agent-browser --session <name> <command>`.

## v1 Reference (branch `v1`)

AngularJS 1.x + Grunt + Bower + node-webkit. Broadcasts every keypress to all 1200+ character directives (O(n)). Build: `grunt dist-mac`. Tests: `npx karma start --single-run`.

## Detailed Docs

See `docs/` for full specifications:
- `docs/architecture.md` — project structure, engine design, data strategy
- `docs/tech-decisions.md` — ADRs with options considered and rationale
- `docs/roadmap.md` — phased delivery plan (Phase 0–3)
- `docs/performance-guide.md` — keystroke hot path, rendering rules, bundle budgets
- `docs/competitive-analysis.md` — Monkeytype, Keybr, TypeRacer comparison
