# Typer v2 — Roadmap

## Phase 0: Scaffolding

**Goal:** Buildable, testable, deployable empty shell.

- [ ] Initialize project with Vite + vite-plugin-solid
- [ ] Configure TypeScript (strict)
- [ ] Configure @solidjs/router
- [ ] Configure Tailwind CSS v4
- [ ] Configure Biome (lint + format)
- [ ] Configure Vitest (unit) + Playwright (E2E)
- [ ] Set up Vercel deployment
- [ ] CI pipeline: typecheck → lint → test → build → deploy preview
- [ ] Base theme (dark) with CSS custom properties
- [ ] Path aliases (@/ → src/)

**Exit criteria:** `pnpm dev` starts the app, `pnpm test` runs, `pnpm build` produces deployable output, preview deploys on PR.

---

## Phase 1: Core Typing Experience

**Goal:** User can paste text and complete a typing test with real-time feedback.

### src/lib/core/
- [ ] `TypingState` type definitions
- [ ] `processKeystroke()` — handles correct, incorrect, backspace, space
- [ ] `calculateWPM()` — gross and net WPM
- [ ] `calculateAccuracy()` — correct / total keystrokes
- [ ] Text normalizer (whitespace, line breaks, character limit)
- [ ] Full unit test coverage for all calc functions

### src/components/
- [ ] `<TypingTest>` — main container, keydown listener
- [ ] `<TextDisplay>` — renders words with 3-line scrolling window
- [ ] Word-level rendering with imperative character class updates
- [ ] `<Caret>` — smooth animated caret (CSS transitions, pre-computed positions)
- [ ] Text input modal (paste custom text)
- [ ] Basic stats bar: live WPM, accuracy, timer
- [ ] Completion detection and basic results display
- [ ] Error highlighting (correct, incorrect, extra, missed)
- [ ] Stop-on-error mode (off / word / letter)

**Exit criteria:** Full typing test flow works end-to-end. Keypress → visual feedback in <16ms. E2E test passes for complete typing flow.

---

## Phase 2: Results & Polish

**Goal:** Rich results screen, local persistence, theme system.

### Results
- [ ] `<ResultsScreen>` — hero WPM, accuracy, consistency
- [ ] Per-second WPM chart (line chart)
- [ ] Character breakdown: correct / incorrect / extra / missed
- [ ] Animated stat counters (motion/dom)
- [ ] Test replay link (re-do same text)

### Persistence
- [ ] Dexie.js v4 database for typing results (liveQuery + SolidJS `from()`)
- [ ] @solid-primitives/storage for user preferences (makePersisted)
- [ ] History list with past results
- [ ] Personal bests tracking (per mode)

### Themes
- [ ] Theme engine: CSS custom properties + `data-theme` attribute
- [ ] 10+ built-in themes (serika dark, dracula, monokai, nord, solarized, etc.)
- [ ] Theme picker in settings
- [ ] System dark/light mode detection with override

### UX Polish
- [ ] Capslock warning indicator
- [ ] `prefers-reduced-motion` support
- [ ] Font size and font family settings
- [ ] Keyboard shortcut: Tab + Enter to restart
- [ ] Focus trap during typing (prevent tab-away)

**Exit criteria:** Complete test → results flow with animated stats. Themes switchable. Results persist across sessions.

---

## Phase 3: Test Modes & Settings

**Goal:** Multiple ways to practice, configurable experience.

### Test Modes
- [ ] Timed mode: 15 / 30 / 60 / 120 seconds
- [ ] Word count mode: 10 / 25 / 50 / 100 words
- [ ] Quote mode: short / medium / long (curated quote database)
- [ ] Custom text mode (existing from Phase 1)
- [ ] Zen mode: no timer, no word count, just type

### Word Generation
- [ ] English word list (top 200, 1k, 5k, 10k)
- [ ] Random word generator with configurable difficulty
- [ ] Punctuation toggle (adds periods, commas, quotes, etc.)
- [ ] Numbers toggle (mixes digits into words)

### Settings
- [ ] `<Settings>` page
- [ ] Caret style: line / block / underline
- [ ] Smooth caret toggle
- [ ] Sound on keypress (optional, multiple profiles)
- [ ] Live WPM display toggle
- [ ] All settings saved to localStorage

**Exit criteria:** All test modes functional. Settings persist. Word generation produces varied, natural-feeling text.

---

## Future Considerations (Post-v2)

These are explicitly out of scope for v2 but worth keeping in mind:

- PWA (installable, offline caching via vite-plugin-pwa)
- User accounts and cloud sync (Supabase or similar)
- Leaderboards and social features
- Result sharing (OG image generation, challenge links)
- Progress analytics (per-key accuracy heatmap, WPM trends)
- Multiplayer real-time racing
- Multiple language support
- Code typing mode (practice typing in programming languages)
- Keyboard layout support (QWERTY, Dvorak, Colemak)
