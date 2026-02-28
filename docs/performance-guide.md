# Typer v2 — Performance Guide

## The Golden Rule

Every keystroke must process in **<16ms** (one frame at 60fps). The user should never perceive any delay between pressing a key and seeing the visual response.

## Keystroke Hot Path

```
Keydown Event
    │
    ├─ [Synchronous — MUST be <5ms]
    │   1. Read currentIndex (signal read)
    │   2. Compare typed char vs text[currentIndex]
    │   3. Update character class (imperative DOM mutation)
    │   4. Increment currentIndex (signal write)
    │   5. Compute WPM/accuracy inline (nanosecond math)
    │
    ├─ [requestAnimationFrame — next frame]
    │   6. Read caret target position (pre-computed lookup)
    │   7. Update caret CSS transform
    │
    └─ [Throttled — rAF or setTimeout 100ms]
    │   8. Update stats display
    │   9. Push to history buffer
```

## Input Handling Rules

### Do
- Use `keydown` (not `keypress` — deprecated, not `keyup` — too late)
- Process every keystroke synchronously — never debounce or throttle
- Compute WPM/accuracy inline on main thread (it's nanosecond math, not worth offloading)
- Batch DOM reads and writes into separate phases
- Use `requestAnimationFrame` for visual-only updates (caret position)
- Use throttled rAF or `setTimeout` for stats display updates

### Don't
- Read `offsetLeft`/`offsetTop` then immediately write styles (causes layout thrashing)
- Add event listeners to every character element (v1's mistake — O(n))
- Use `setTimeout` or `requestIdleCallback` for keystroke processing
- Use `requestIdleCallback` for deferred work during typing (it will never fire during sustained input)
- Offload WPM calculations to Web Workers (postMessage overhead is 20,000x slower than inline math)
- Create per-character reactive components (use word-level rendering with imperative class updates)

## Rendering Performance

### CSS
```
DO:
  - transform: translateX/translateY for caret (GPU composited)
  - will-change: transform on the caret element
  - CSS transitions for caret movement (no JS animation library)
  - content-visibility: auto on off-screen text sections

DON'T:
  - Animate width/height/top/left (triggers layout reflow)
  - Use box-shadow animation (expensive repaint)
  - Apply transitions to color changes on characters (100+ elements)
```

### DOM
```
DO:
  - Render only visible lines + 1 buffer line above/below
  - Use word-level components with character <span> children
  - Use class toggling for character state (not inline styles)
  - Pre-compute character positions at render time

DON'T:
  - Create a reactive component per character (creates O(n) signal subscriptions)
  - Render all 1200+ characters in the DOM at once (v1's approach)
  - Create/destroy DOM nodes during typing (reuse, toggle visibility)
  - Use display:none/block for scrolling (use transform: translateY)
  - Read offsetLeft/offsetTop per keystroke (pre-compute at render time)
```

## Bundle Size Budgets

| Chunk | Budget | Contents |
|-------|--------|----------|
| Initial JS | <50KB gz | SolidJS runtime, typing engine, main route |
| CSS | <15KB gz | Tailwind utilities, theme definitions |
| Results chunk | <30KB gz | Chart library, motion/dom animations (lazy loaded) |
| Settings chunk | <20KB gz | Theme picker, config UI (lazy loaded) |
| Total | <115KB gz | Everything |

## Measuring Performance

### Key Metrics
- **Input latency**: Time from `keydown` event to DOM update (measure with `performance.mark`)
- **Frame budget**: % of frames completing in <16ms during active typing
- **FCP**: First Contentful Paint (<1.0s)
- **TTI**: Time to Interactive (<1.5s)
- **Lighthouse**: Performance score >95

### How to Measure Input Latency

```typescript
document.addEventListener("keydown", (e) => {
  performance.mark("keystroke-start");

  processKeystroke(e);

  requestAnimationFrame(() => {
    performance.mark("keystroke-painted");
    performance.measure("keystroke-latency", "keystroke-start", "keystroke-painted");
    const measure = performance.getEntriesByName("keystroke-latency").pop();
    if (measure && measure.duration > 16) {
      console.warn(`Slow keystroke: ${measure.duration.toFixed(1)}ms`);
    }
    performance.clearMeasures("keystroke-latency");
    performance.clearMarks();
  });
});
```
