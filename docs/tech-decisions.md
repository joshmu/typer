# Typer v2 — Technology Decisions

Each decision is documented with context, options considered, and rationale.

---

## 1. UI Framework: SolidJS

**Context:** A typing app's critical path is keydown → state update → DOM update, which must complete in <16ms.

**Options considered:**

| Framework | Bundle (brotli) | CPU Benchmark | Partial Update | Typing App Fit |
|-----------|----------------|---------------|----------------|----------------|
| SolidJS | 4.5 KB | 1.11 | 10.4ms | Best — signals, no VDOM |
| Svelte 5 | 12.2 KB | 1.14 | 11.0ms | Strong — compiled runes |
| Preact + Signals | 5.7 KB | 1.62 | 21.1ms | Decent — React compat |
| React 19 | 51.4 KB | 1.55 | 14.1ms | Overkill — VDOM overhead |
| Vue 3 | 22.8 KB | 1.28 | 12.4ms | Acceptable but heavier |

*Benchmark data: krausest/js-framework-benchmark, Chrome 145, Feb 2026*

**Decision:** SolidJS (without SolidStart)

**Rationale:**
- No VDOM means zero diffing overhead on the keystroke hot path
- Fine-grained signals update only the specific DOM nodes that changed — O(1) per keystroke
- 4.5 KB brotli — smallest bundle of the mature options
- Signals work in any `.ts` file — clean separation of typing engine from UI
- Monkeytype (19.5k stars, 120k daily users) validated this choice by migrating to SolidJS in Jan 2026
- #1 developer satisfaction in State of JS 2025 for 5 years running (90.87%)
- JSX syntax — familiar, well-supported by tooling
- SolidStart dropped due to maturity issues (Cloudflare 404s, broken bindings). Use SolidJS + Vite + @solidjs/router directly, which is what Monkeytype does.

**Why not Svelte 5:** Close second. Runes are restricted to `.svelte`/`.svelte.ts` files, making it harder to separate engine logic from UI. Less familiar syntax for AI-assisted development. Slightly larger bundle (12.2 KB vs 4.5 KB).

---

## 2. Styling: Tailwind CSS v4

**Context:** Need rapid prototyping, zero-runtime CSS, and a robust theme system.

**Decision:** Tailwind CSS v4

**Rationale:**
- Zero runtime — no JS executed for styling
- CSS custom properties are the natural theming mechanism (swap `--color-*` variables)
- v4's Oxide engine (Rust) makes builds fast
- Massive ecosystem of components, examples, and tooling
- Dark mode is first-class (`dark:` variant)

---

## 3. State Management: SolidJS Built-in (Signals + Stores)

**Context:** Need to manage real-time typing state with per-keystroke updates and minimal re-renders.

**Decision:** No external library. Use SolidJS signals and stores.

**Rationale:**
- Signals provide O(1) granular updates — when `currentIndex` changes, only the DOM nodes reading it update
- Stores (proxy-based) track property access at the leaf level
- `createMemo` for derived values (WPM, accuracy) — only recompute when dependencies change
- Adding external state libraries would add bundle size for zero benefit in SolidJS

---

## 4. Build: Vite

**Context:** Need fast dev server with HMR and efficient production builds.

**Decision:** Vite (with vite-plugin-solid)

**Rationale:**
- Near-instant HMR via native ESM
- SolidJS ecosystem built around Vite
- Flat project structure — no monorepo overhead (Turborepo/pnpm workspaces dropped as unjustified for a single app)
- Path aliases (`@/` → `src/`) for clean imports
- Rolldown integration available when Vite 8 stabilizes

**Structure:**
```
src/
  components/     # Solid components
  lib/
    core/         # Pure TypeScript — typing engine, calculations
  routes/         # @solidjs/router pages
  styles/         # Tailwind config, theme definitions
```

---

## 5. Testing: Vitest + Playwright

**Context:** Typing engine needs thorough unit tests. UI needs cross-browser E2E verification.

| Layer | Tool | Scope |
|-------|------|-------|
| Unit | Vitest | `src/lib/core/` — WPM calc, accuracy, text processing, state machine |
| Component | Vitest + @solidjs/testing-library | Individual components, keyboard input |
| E2E | Playwright | Full typing flows across Chrome, Firefox, Safari |

**Rationale:**
- Vitest 4.0 with stable Browser Mode for real DOM testing of SolidJS components
- Playwright for cross-browser E2E — its keyboard API can simulate real typing flows
- The typing engine is pure TypeScript — trivially testable without any browser

---

## 6. Linting & Formatting: Biome

**Context:** Need fast linting and formatting that doesn't slow down CI.

**Decision:** Biome alone (replaces ESLint + Prettier + oxlint)

**Rationale:**
- 423+ lint rules, viable as sole linter
- Rust-based — runs in <1s where ESLint + Prettier would take 10-30s
- Single tool for both linting and formatting — no config overlap or duplicate diagnostics
- TypeScript support is native
- ~5.8M weekly npm downloads, actively maintained

**Why not oxlint + Biome:** Duplicate diagnostics with no dedup mechanism. Using Biome alone is simpler.

---

## 7. Data: Dexie.js v4 + localStorage

**Context:** Local-first app. All data stored in the browser. No backend required.

**Decision:** Dexie.js v4 for structured data, localStorage for simple preferences.

| Storage | Use Case |
|---------|----------|
| Dexie.js (IndexedDB) | Typing results, history, personal bests |
| localStorage | User preferences (theme, config settings) |

**Rationale:**
- Dexie.js v4: ~29 KB, reactive liveQuery, Safari v4 fixes, solid-dexie SolidJS adapter available
- IndexedDB handles structured queries (filter by mode, sort by WPM, date ranges)
- localStorage is sufficient for flat key-value preferences
- No backend, no accounts, no sync — dramatically simpler architecture

**Why not Supabase/cloud:** Removed from scope. Local-first simplifies everything. Cloud sync can be added later if users request it.

---

## 8. Deployment: Vercel

**Context:** The app is a static SPA with no server-side logic.

**Decision:** Vercel

**Rationale:**
- Excellent SPA deployment support
- Good free tier for personal projects
- Simple GitHub integration for preview deploys on PR
- Global CDN

---

## 9. Animation: motion/dom + CSS

**Context:** Two distinct animation needs — high-frequency caret movement and one-time result reveals.

| Use Case | Tool | Why |
|----------|------|-----|
| Caret movement | CSS `transition` | Lowest latency — no JS in the path, GPU composited |
| Caret blink | CSS `animation` (step-end) | Pure CSS, zero overhead |
| Result screen stats | motion/dom (vanilla API) | Stagger, spring physics, number counting |
| Page transitions | View Transitions API | Native browser API, progressive enhancement |

**Rationale:**
- The caret is on the keystroke hot path — CSS transitions have zero JS overhead
- motion/dom is the vanilla (framework-agnostic) API from the Motion library — works with SolidJS without a framework-specific wrapper
- ~15 KB gz, MIT licensed

**Why not solid-motionone:** Wraps the old Motion One, not the merged Motion library. Use motion/dom directly.

---

## 10. Routing: @solidjs/router

**Decision:** @solidjs/router (official SolidJS router)

**Rationale:**
- Official, maintained by the SolidJS team
- File-based or config-based routing
- Lazy loading built-in for code splitting (results page, settings page)
- TanStack Router has a SolidJS adapter but is overkill for this app's simple routing needs
