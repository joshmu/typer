---
name: verify
description: Verify a typer change at its runtime surface by driving the app in a real browser (local dev server or production) with Playwright under bun.
---

# Verify typer

## Handle
- Production: `https://typer.joshmu.dev` (Vercel deploys `main`; the commit status context `Vercel` reports the deploy result).
- Local: `pnpm dev` serves `http://localhost:3000`. Playwright reuses any server already on 3000, so check `lsof -nP -iTCP:3000 -sTCP:LISTEN` first when other worktrees may be running.
- Drive with a throwaway script run by `bun` from the repo root (so `@playwright/test` resolves): write `./.verify-*.ts`, run it, then `trash` it. Screenshots go to `$TMPDIR`.

## Driving the typing view
- Mode buttons: `getByRole("button", { name: "time" | "words" | "zen" | "custom" | "book", exact: true })`. Use `exact`: book cover buttons also match.
- The mode selector only renders while no text is loaded, so time sub-options (15/60/120s) are not reachable once time mode loads its text; time mode runs at 30s.
- Focus `getByTestId("typing-test")`, then type. Words are `[data-testid="text-display"] > div > span` (text includes a trailing space); the active word has `data-word-active="true"`; the caret is `[data-testid="caret"]`. After a keystroke, wait for the 80ms caret transition before measuring caret geometry.
- Results: text `Redo` (or `Continue Reading` in book mode); a finished book shows `100% complete` with no redo button.

## Book mode without network flakiness
Route `https://standardebooks.org/**` to the fixtures in `e2e/fixtures/standardebooks.ts` (same stub as `e2e/book-mode.spec.ts`) and delete IndexedDB `TyperDB` first. The fixture book is about 72 words over 2 chapters, so the end of the book is reachable. The stub 404s unmapped paths (covers), which shows as console 404s.

## Horde
`/game?testMode=1` exposes `window.__game` (`getState`, `sendKeys`, `stepTicks`, `sendPerk`, `renderReady`). Wait for `renderReady()`, `stepTicks(120)` to spawn, type the target's current word with `sendKeys`, `stepTicks(1)`, then read HUD test ids (`game-combo`, `game-kills`, `boss-bar`).

## Flows worth driving
Time mode idle end and typing past the generated words; Tab then Enter on results; Word remount count per keystroke (MutationObserver on the words container); book Esc mid-chunk then Continue; Settings caret/font size/live WPM/theme then the typing view; Horde kill and combo bar decay.
