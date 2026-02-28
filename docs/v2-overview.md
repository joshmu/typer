# Typer v2 — Overview

## Vision

A modern, high-performance typing practice web app that lets users paste custom text or choose from curated content, and track their progress locally with zero-latency feedback.

## Why v2

v1 was built with AngularJS 1.x, Grunt, Bower, and node-webkit — a 2014-era stack. The entire typing engine broadcasts every keypress to all 1200+ character directives (O(n) per keystroke), uses two-way binding with `$scope`, and bundles vendored dependencies. It cannot be meaningfully improved without a full rewrite.

## Goals

1. **Sub-16ms input latency** — every keystroke processes in a single frame (60fps)
2. **Local-first** — all data stored in the browser, no account required
3. **Themeable** — dark mode by default, 20+ themes, custom theme creation
4. **Progressive** — starts as a simple typing test, grows into a full practice platform
5. **Lightweight** — minimal bundle, fast load, no unnecessary dependencies

## Non-Goals (for initial release)

- Multiplayer/competitive racing
- User accounts or cloud sync
- Leaderboards or social features
- Structured lesson curriculum (we're a practice tool, not a teaching tool)
- Mobile typing support (tablet is fine, phone keyboards are a different UX)
- PWA / installable app (can add later if users want it)
- AI-generated practice text (future enhancement)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | SolidJS + Vite + @solidjs/router |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 + CSS custom properties for themes |
| Animation | motion/dom (vanilla) + CSS transitions (caret) |
| State | SolidJS signals + stores (built-in) |
| Testing | Vitest (unit/component) + Playwright (E2E) |
| Build | Vite |
| Linting | Biome (lint + format) |
| Data | Dexie.js v4 (IndexedDB) + localStorage |
| Deployment | Vercel |

## Key Architectural Decisions

See [architecture.md](./architecture.md) for details on:
- Why SolidJS over React/Svelte/others
- O(1) keystroke processing via signal-based cursor
- Word-level rendering with imperative character updates
- Separation of typing engine (pure TS) from UI (Solid components)
- Theme system design

## Phased Delivery

See [roadmap.md](./roadmap.md) for the full phased plan.

| Phase | Scope |
|-------|-------|
| 0 | Project scaffolding, tooling, CI/CD |
| 1 | Core typing engine + minimal UI (custom text mode) |
| 2 | Results screen, local history, theme system |
| 3 | Test modes (timed, word count, quotes), settings |
