# Typer v2 — Competitive Analysis

## Landscape

| App | Strengths | Weaknesses | Typer Opportunity |
|-----|-----------|------------|-------------------|
| **Monkeytype** | Gold standard UX, massive customization, 200+ themes, 200+ languages, open source | No structured learning, complex codebase, overwhelming settings for new users | Simpler, more focused experience — quality over quantity |
| **Keybr** | Adaptive learning algorithm, per-key statistics, progressive letter unlocking | Only lowercase by default, dated visual design | Better visual design with keybr-style analytics |
| **TypeRacer** | Competitive multiplayer, real quotes, established community | Dated UI, not open source, no customization | Modern design with competitive features later |
| **Nitro Type** | Gamification, classroom tools, mobile-first | Targeted at K-12, not serious typists | Adult-focused, clean design |
| **TypingClub** | 600+ lessons, structured curriculum, hand guides | Teaching focus, not practice | Practice-first with optional weak-key drills |

## Key UX Patterns to Adopt

### From Monkeytype
- **Smooth caret** with configurable transition speed (80-120ms)
- **Character-level error states**: correct (dim), incorrect (red), extra (dark red), missed (underlined)
- **3-line scrolling text window** with smooth translateY transitions
- **Tab + Enter to restart** keyboard shortcut
- **Dark mode default** — every serious typing app is dark by default
- **Minimal chrome** — hide stats/UI during typing, show only what's essential

### From Keybr
- **Per-key accuracy tracking** — build a heatmap of weak keys
- **Progress visualization** — show improvement over time per metric

### From TypeRacer
- **Real content** — quotes from books, movies, songs (more engaging than random words)

## Differentiation Strategy

Typer v2 won't try to out-feature Monkeytype. Instead:

1. **Simplicity first** — beautiful, focused UI that doesn't overwhelm. Sensible defaults, discoverable settings.
2. **Local-first** — no account required, all data in the browser. Zero friction to start.
3. **Custom text focus** — our v1 heritage. Make pasting custom text the smoothest experience possible.
4. **Progressive complexity** — start with just a typing test. Unlock more features as the user returns.
5. **Beautiful results** — invest heavily in the results screen with animations and insights.
