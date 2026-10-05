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
        layout/             # Caret/word position cache (pure lookups)
        types/              # Shared TypeScript types
    routes/                 # @solidjs/router pages
    styles/                 # Tailwind config, theme definitions
  public/                   # Static assets
  e2e/                      # Playwright tests
  index.html
  vite.config.ts
```

No monorepo. Flat structure with path aliases (`@/` → `src/`). The typing engine lives in `src/lib/core/` as TypeScript with zero framework imports.

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
  keystrokes: { correct: number; incorrect: number }; // every character key, kept after backspace
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

### Engine Functions (framework-free, testable)

```typescript
// No Solid, no DOM, deterministic: time only arrives as arguments
function applyKeystroke(state: TypingState, key: string, now: number): void // mutates a draft in place
function processKeystroke(state: TypingState, key: string, now: number): TypingState // pure clone-then-apply
function calculateWPM(chars: CharacterState[], elapsedMs: number): number
function calculateRawWPM(keystrokes: KeystrokeCounts, elapsedMs: number): number
function calculateAccuracy(keystrokes: KeystrokeCounts): number
function collectPerSecondWPM(chars: CharacterState[], startTime: number, elapsedMs: number): number[]
function calculateConsistency(perSecondWPM: number[]): number
function calculateCharBreakdown(state: TypingState): CharBreakdown
```

Result stats:

- **Accuracy** is keystroke accuracy: correct character keys over all character keys, so a corrected typo still costs accuracy. It is rounded down, so any mistake keeps it below 100.
- **Raw WPM** counts every character key, including ones later backspaced; **WPM** counts correct characters left in the text.
- **Per-second WPM** has one sample per second of the test's duration, idle seconds included, so the chart covers the whole test.
- **Key activity** (`state.activity`) is counted as keys land: the last character key's time, and character keys and mistakes per second. Backspace and stop-on-error word resets do not erase it, so the raw and error chart lines, AFK and the idle tail all see keys whose characters were later erased.
- **Consistency** is computed from correct-character WPM per second (Monkeytype uses raw). Time tests keep every second; tests ended by Esc or by the text running out drop the idle tail after the last character key.
- **errorCount** (complete-test.ts) counts only uncorrected errors: incorrect and extra characters left in the text.
- **Missed** characters are ones the user skipped: untyped characters behind the cursor. Text the user never reached is not counted, and the breakdown total is only the characters covered.

### Typing Session

`createTypingSession({ state, feed, write, onComplete })` (src/lib/core/engine/typing-session.ts) owns a test from first key to completion: the keystroke fold, each mode's end rule and refilling from the feed. It exposes `key(k, now)`, `tick(now)`, `deadline()` and `complete`, and calls `onComplete` exactly once.

| Mode | End rule |
|---|---|
| time | at `startTime + seconds`, via `tick`; refills from the word feed, so the last word never ends it |
| words, quote, custom | on the last word |
| zen | on Esc once started; refills from the word feed |
| book | on Esc once started, or on the last word once the Book reader cursor runs out |

Every state change goes through the injected `write(mutate)` port. Engine functions mutate only the draft they are given, touching the current char, its word and the cursor, so a store applies each keystroke path-scoped.

### Character Matching — Diacritics Support

`applyKeystroke` uses `isCharMatch()` (src/lib/core/text/char-match.ts) instead of strict `===` for character comparison. This enables typing base characters to match accented book text:

```typescript
// Unicode NFD decomposition: "ž" → "z" + combining caron → base "z"
isCharMatch("z", "ž")  // true — z matches ž
isCharMatch("e", "é")  // true — e matches é
isCharMatch("Z", "Ž")  // true — case preserved
isCharMatch("z", "Ž")  // false — case mismatch
```

This is critical for book mode where Standard Ebooks texts contain diacritics that users can't type on standard keyboards.

### Book Reader — Committed Position

`openBookReader(book, progress)` (src/lib/core/engine/book-reader.ts) owns the reader's place in a book. `cursor()` returns a throwaway feed starting at the committed position; the session reads ahead from it and reading ahead never moves the position. `commit(wordsTyped, stats)` advances from the committed position by the words actually typed and returns the next `BookProgress` to persist. `percent` is committed word offset over the book's total words, and is the only book percent shown in the UI. Stored offsets past a chapter's end are clamped on open.

## Reactive UI Layer

The Solid components wrap the engine. `TypingTest` keeps only DOM wiring: it hands keys to the session and arms a `setTimeout` to the time deadline that calls `tick`.

```typescript
const [state, setState] = createStore<TypingState>(initTypingState(text, mode, stopOnError));

const session = createTypingSession({
  state,
  feed,
  // produce applies the engine's in-place writes path-scoped: no words-array replacement
  write: (mutate) => setState(produce(mutate)),
  onComplete,
});

// Keydown handler: the hot path
function handleKeydown(e: KeyboardEvent) {
  e.preventDefault();
  session.key(e.key, Date.now());
}
```

## Caret

The caret is an absolutely-positioned element that transitions to the current character's position. Character positions live in a `LayoutCache` (`src/lib/core/layout/layout-cache.ts`) so the keystroke hot path never reads `offsetLeft`/`offsetTop`.

```
┌──────────────────────────────────────┐
│  the quick brown fox jumps over      │
│       ▏← caret (CSS transition)      │
│                                      │
│  CSS: transition: transform 80ms;    │
│  Position: getCaretPosition(cache,   │
│            wordIdx, charIdx)         │
│  Cache rebuilt: mount, words change, │
│                 ResizeObserver       │
└──────────────────────────────────────┘
```

The cache lives in pure TypeScript (`src/lib/core/layout/`); the DOM measurer that populates it lives in the component layer (`src/components/typing/use-layout-cache.ts`) so the engine layer's purity rule holds. See `docs/performance-guide.md` for the full trigger model.

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
- Triggers when getWordTop(layoutCache, currentWordIndex) > first visible line's bottom
```

Like the caret, the scroll calculation reads from the shared `LayoutCache` — never from `offsetTop` per keystroke.

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

`PreferencesProvider` (src/lib/preferences-context.tsx) is the only place preferences reach the document: one effect applies the theme and sets `--typing-font-size`. Typing components read caret style, smooth caret, live WPM and font size through `usePreferences()`, and a font size change re-measures the layout cache.

### Book Source

Book mode fetches catalogue, book and chapter documents straight from `https://standardebooks.org` (`SE_ORIGIN` in src/lib/core/text/se-source.ts), which allows any origin. Each fetch retries network errors, 429 and 5xx within its time limit (src/lib/http-retry.ts), and the last good catalogue is kept for when a refresh fails. There is no same-origin proxy: Standard Ebooks answers Vercel's egress with 403 (verified 2026-10-05).

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
