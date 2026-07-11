# Horde Mode — Combat Feel & Battlefield Persistence (Plan 7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Round-2 playtest items: free-flow typing with persistent partial progress across targets (ZType-informed routing + Backspace release), all boss words visible upfront, turret that aims instead of spinning, per-family locomotion gaits, Crimsonland-style corpses baked into the ground, label readability fix, hero detail.

**Research anchors (docs/superpowers/specs — see repo memory):** Crimsonland bakes corpses/blood as decals into a ground render-target (zero per-frame cost); ZType locks on first letter with nearest tie-break and spawn-time initial uniqueness (we already have the spawn rule); Typing of the Dead adds Backspace-to-release. Player aim = continuous atan2 toward target.

## Global Constraints

- Sim purity + determinism scan; TDD; fixture re-record ONCE per hash-shifting task.
- Render pooling; probe-screenshot verification (scripts/visual-probe.mjs) with Read on every visual task — iterate until checklist passes.
- Commits `type(game): …` + session trailer; pre-commit hooks; full end gate at finish.

---

### Task 1 (sim): word chains — all words assigned at spawn

`EnemyState`: replace `word: string` + reassignment with `words: string[]`, `wordIndex: number`, `typedCount` (within current word). Invariant: `words.length === archetype.hp` at spawn (1 completion = 1 damage), drawn from the tier band; first word's initial obeys the existing field-uniqueness rule; later words unconstrained. Current word helper `currentWord(e)` in state.ts. Shield absorb: advances `wordIndex` without damage and APPENDS a fresh band word (so words never run out while alive). `reassignWord` deleted; combat's `resolveCompletion` advances `wordIndex`. Update every consumer (targeting reads `currentWord(e)[e.typedCount]`, renderer, tests). Fixture re-record.

### Task 2 (sim): free-flow routing + Backspace release

New targeting in step.ts typing section (replaces current no-target/locked branches):

1. Key matches active target's next needed char → advance (unchanged).
2. Else, scan candidates: every alive targetable enemy where key matches `currentWord(e)[e.typedCount]` (covers fresh enemies at 0 AND previously-partial enemies at their saved progress), plus powerups per existing rules. Nearest wins. Switch `targetId` (old enemy KEEPS `typedCount` — no reset), advance new target. NOT a miss.
3. No candidate anywhere → miss + combo break (unchanged), and if the key matches only a cloaked enemy, keep the existing ignore rule.
4. New event `{ type: "backspace" }`: clears `targetId`, keeps all progress, never a miss. GameShell maps Backspace (preventDefault).

Tests: switch-mid-word keeps both progresses; return-to-first resumes at saved count; nearest tie-break among two partials; backspace release; miss only on dead keys. Fixture re-record rides Task 1's unless hashes shift again.

### Task 3 (render): labels v3 — stacked words, progress always visible, readability

- Stacked plates for `words.slice(wordIndex)` (current word bottom/nearest enemy, up to 3 shown + "+n" chip); current word full brightness, queued words 55% scale/40% alpha.
- Plate fill alpha 0.7 → 0.92; word text gets 3px dark `strokeText` outline BEFORE fill (fixes bright-glow washout behind plates).
- Partial-progress enemies that are NOT the active target keep their amber typed prefix visible (they already do — verify) + a thin amber progress underline on the plate so "semi-completed" enemies read at a glance.
- Active target: existing brighter treatment + a subtle chevron above the plate.
- Texture height grows for stacks (single texture per enemy, plates drawn stacked in one draw), plane height scales accordingly.

### Task 4 (render): turret aim + hero detail

- Aim: barrels rotate via atan2 toward active target; no active target → nearest alive enemy (anticipatory); none → HOLD last heading (delete idle spin). Smooth slerp ~0.2.
- Detail pass: hexagonal base plates, twin barrels with per-shot recoil (offset spring on tracer fire), slow independent radar ring, cooling fins, combo-scaled core glow. Keep pooled/no-alloc.

### Task 5 (render): locomotion gaits

Per-family procedural gait driven by sim state (tick, vel magnitude, dash phase from spawnTick — read-only): husk spike-ripple + body roll along travel; darter squash-stretch thrust pulses along vel; wraith ring counter-spin + core lead-lag; charger crouch-then-lunge synced to dash-pause phase; weaver orb counter-orbit tightening with speed; brood children wobble; bosses add slow menace sway. Amplitude scales with |vel| so stopped enemies idle subtly instead of gliding statically.

### Task 6 (render): battlefield persistence — corpse decals baked into ground

Crimsonland technique: ground material's diffuse becomes a `DynamicTexture` (2048²) initialized by drawing `terrain.png` into it once loaded; on each death event (loop already derives kills vs breaches) stamp decals into the texture at the world→UV position: dark scorch ellipse + 2-3 family-tinted splat blobs + debris flecks, random-ish rotation from enemy id hash (render-side determinism fine). `texture.update()` only on death frames. Breaches stamp a red core-side scar instead. Zero live decal entities, unbounded accumulation for free. Keep the emissive texture path consistent (stamp into both or drop emissive to a static copy — pick what looks right in probe).

### Task 7: probes, snapshots, e2e, docs

- E2E: new probe — type 2 chars of enemy A's word, switch to enemy B via its initial, kill B, return and finish A (testMode sendKeys; assert kills 2 and A's progress preserved mid-flow). Backspace release probe.
- Visual: probe-verify every checklist; regenerate darwin baseline once at end; orchestrator handles linux via update-snapshots workflow.
- docs/game-design.md: targeting model spec (routing rules), decal bake note, gait table.
