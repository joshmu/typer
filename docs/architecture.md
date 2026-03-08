# Typer v2 — Architecture

## Project Structure

```
typer/
  src/
    components/
      typing/               # TypingTest, TextDisplay, Caret
      results/              # ResultsScreen, StatsCard, WPMChart
      settings/             # ThemePicker, TestConfig
      layout/               # Header, Footer
    lib/
      core/                 # Pure TypeScript — zero framework deps
        engine/             # Typing engine (state machine)
        calc/               # WPM, accuracy, consistency calculations
        text/               # Text processing, word lists
        types/              # Shared TypeScript types
    routes/                 # @solidjs/router pages
    styles/                 # Tailwind config, theme definitions
  public/                   # Static assets
  e2e/                      # Playwright tests
  index.html
  vite.config.ts
```

No monorepo. Flat structure with path aliases (`@/` → `src/`). The typing engine lives in `src/lib/core/` as pure TypeScript with zero framework imports.

## Why SolidJS

A typing app's hot path is: keydown event → state update → DOM update. This must happen in <16ms (one frame at 60fps).

**SolidJS** has no Virtual DOM. When a signal updates, it directly mutates the specific DOM node that reads that signal. There is no diffing, no reconciliation, no component re-rendering. Components run exactly once (like a setup function), and only the reactive expressions within them re-execute.

This matters because:
- React re-renders the component function and diffs a virtual tree on every state change (14.1ms partial update vs SolidJS's 10.4ms)
- Svelte 5 runes are close but restricted to `.svelte` and `.svelte.ts` files
- SolidJS signals work in any `.ts` file, enabling clean separation between engine logic and UI
- Monkeytype (19.5k stars, 120k daily users) validated this choice by migrating to SolidJS in Jan 2026

## Typing Engine — O(1) Keystroke Processing

The v1 architecture broadcasts every keypress to all character directives (O(n)). v2 uses a cursor-based approach:

```
┌─────────────────────────────────────────┐
│  Keydown Event                          │
│  ┌───────────────────────────────────┐  │
│  │ 1. Read currentIndex signal       │  │  O(1)
│  │ 2. Compare typed char vs          │  │
│  │    text[currentIndex]             │  │
│  │ 3. Update character state         │  │
│  │ 4. Increment currentIndex         │  │
│  └───────────────────────────────────┘  │
│                                         │
│  Only the affected DOM nodes update     │
│  (fine-grained reactivity)              │
└─────────────────────────────────────────┘
```

### Rendering Granularity

Render at the **word level**, not per-character components. Each word is a `<span>` containing character `<span>` elements. Character state changes update CSS classes imperatively — this avoids creating hundreds of reactive subscriptions. This is the approach Monkeytype uses.

```typescript
// Word-level component, characters are inner spans
function Word(props: { index: number }) {
  let wordRef: HTMLSpanElement;

  createEffect(() => {
    const word = state.words[props.index];
    // Update character classes imperatively
    const chars = wordRef.children;
    for (let i = 0; i < chars.length; i++) {
      chars[i].className = characterClass(word.characters[i].status);
    }
  });

  return (
    <span ref={wordRef!} class="word">
      <For each={state.words[props.index].characters}>
        {(char) => <span>{char.expected}</span>}
      </For>
    </span>
  );
}
```

### Engine State (src/lib/core/)

```typescript
// Pure TypeScript — no framework imports
interface TypingState {
  text: string;
  characters: CharacterState[];
  currentIndex: number;
  startTime: number | null;
  endTime: number | null;
  mode: TestMode;
  config: TestConfig;
}

interface CharacterState {
  expected: string;
  typed: string | null;
  status: "pending" | "correct" | "incorrect" | "extra" | "missed";
  mistakes: number;
  timestamp: number | null;
}

type TestMode =
  | { type: "time"; seconds: 15 | 30 | 60 | 120 }
  | { type: "words"; count: 10 | 25 | 50 | 100 }
  | { type: "quote"; length: "short" | "medium" | "long" }
  | { type: "custom" };

interface TestConfig {
  punctuation: boolean;
  numbers: boolean;
  language: string;
  stopOnError: "off" | "word" | "letter";
  caretStyle: "line" | "block" | "underline";
  smoothCaret: boolean;
}
```

### Engine Functions (pure, testable)

```typescript
// All pure functions — easy to test with Vitest
function processKeystroke(state: TypingState, key: string): TypingState
function calculateWPM(chars: CharacterState[], elapsedMs: number): number
function calculateAccuracy(chars: CharacterState[]): number
function calculateConsistency(perSecondWPM: number[]): number
function isTestComplete(state: TypingState): boolean
```

### Character Matching — Diacritics Support

`processKeystroke` uses `isCharMatch()` (src/lib/core/text/char-match.ts) instead of strict `===` for character comparison. This enables typing base characters to match accented book text:

```typescript
// Unicode NFD decomposition: "ž" → "z" + combining caron → base "z"
isCharMatch("z", "ž")  // true — z matches ž
isCharMatch("e", "é")  // true — e matches é
isCharMatch("Z", "Ž")  // true — case preserved
isCharMatch("z", "Ž")  // false — case mismatch
```

This is critical for book mode where Standard Ebooks texts contain diacritics that users can't type on standard keyboards.

### Book Resume — Exact Word Position

Book mode saves progress using `computeBookResumePosition()` (src/lib/core/engine/book-resume.ts) which computes the resume offset from actual typed words, not the feeder's pre-fetched position. The book feeder pre-loads words ahead of the user's typing cursor; the resume function creates a temporary feeder and advances it by exactly the number of completed words to find the correct chapter/offset for next session.

## Reactive UI Layer

The Solid components wrap the pure engine:

```typescript
const [state, setState] = createStore<TypingState>(initialState);

const wpm = createMemo(() =>
  calculateWPM(state.characters, elapsed())
);

const accuracy = createMemo(() =>
  calculateAccuracy(state.characters)
);

// Keydown handler — the hot path
function handleKeydown(e: KeyboardEvent) {
  if (shouldIgnoreKey(e)) return;
  e.preventDefault();

  setState(processKeystroke(state, e.key));
}
```

## Caret

The caret is an absolutely-positioned element that transitions to the current character's position. Character positions are **pre-computed at render time** to avoid per-keystroke layout reflow.

```
┌──────────────────────────────────────┐
│  the quick brown fox jumps over      │
│       ▏← caret (CSS transition)      │
│                                      │
│  CSS: transition: transform 80ms;    │
│  Position: pre-computed offsetLeft   │
│  Update: requestAnimationFrame       │
└──────────────────────────────────────┘
```

The caret blinks when idle (no keypress for 1.5s) using CSS `animation: blink 1s step-end infinite`.

## Text Display Scrolling

Text is rendered in a fixed-height container showing ~3 lines. When the active word moves to a new line, the container scrolls:

```
┌──────────────────────────────────────┐
│ ┌──────────────────────────────────┐ │
│ │ the quick brown fox jumps over   │ │  visible
│ │ the lazy dog and then some more  │ │  window
│ │ text that keeps on going for a   │ │  (3 lines)
│ └──────────────────────────────────┘ │
│   while longer and more words here   │  hidden
│   until the very end of the text     │  (overflow)
└──────────────────────────────────────┘

Scroll mechanism:
- Container: overflow: hidden; height: 3 * lineHeight
- Inner wrapper: transform: translateY(-${lineOffset}px)
- Transition: transform 150ms ease-out
- Triggers when active word's top > first visible line's bottom
```

## Theme System

Themes are pure CSS custom property overrides:

```css
:root {
  --bg: #323437;
  --text: #d1d0c5;
  --text-sub: #646669;
  --primary: #e2b714;
  --error: #ca4754;
  --error-extra: #7e2a33;
  --caret: #e2b714;
  --correct: #d1d0c5;
}

[data-theme="dracula"] {
  --bg: #282a36;
  --text: #f8f8f2;
  --primary: #bd93f9;
  --error: #ff5555;
  --caret: #f8f8f2;
}
```

Themes are defined as JSON objects and compiled into CSS at build time.

## Data Strategy — Local Only

All data stays in the browser. No backend, no accounts, no sync.

| Storage | Use Case | Library |
|---------|----------|---------|
| IndexedDB | Typing results, history, personal bests | Dexie.js v4 (30 KB) |
| localStorage | User preferences (theme, config) | @solid-primitives/storage (2 KB) |

```
┌─────────┐    ┌───────────┐
│  Typing  │───▶│ Dexie.js  │  Reactive via safeFrom(liveQuery) + SolidJS
│  Engine  │    │(IndexedDB)│  Indexed queries: [mode+wpm], timestamp
└─────────┘    └───────────┘

┌─────────┐    ┌───────────────────────────┐
│  Config  │───▶│ @solid-primitives/storage │  makePersisted() wraps signals
│  (prefs) │    │      (localStorage)       │  with automatic persistence
└─────────┘    └───────────────────────────┘
```

### Error Recovery

All Dexie reactive queries use `safeFrom()` (src/lib/safe-query.ts) which catches liveQuery errors and returns fallback values instead of crashing the SolidJS render tree. All DB mutations are wrapped in try-catch. If the DB fails to open (corrupted state, blocked upgrade), it auto-deletes and reloads — a one-time recovery for users with incompatible IndexedDB state.

## Performance Budgets

| Metric | Target |
|--------|--------|
| Input latency | <16ms (1 frame @ 60fps) |
| First Contentful Paint | <1.0s |
| Time to Interactive | <1.5s |
| JS bundle (initial) | <50KB gzipped |
| Lighthouse Performance | >95 |
