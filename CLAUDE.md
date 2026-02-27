# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Typer is a touch-typing web app that lets users paste in custom text to practice typing. It tracks WPM, accuracy, keystrokes, and displays a progress bar with correct/incorrect portions.

**v1 (tagged `v1.0.0`, branch `v1`)** is the legacy implementation described below. The `main` branch is for the v2 overhaul.

## v1 Architecture (Legacy - AngularJS 1.x + node-webkit)

The v1 app has two layers:
- **AngularJS web app** (`app/`) — the typing UI, served from `app/views/index.html`
- **node-webkit wrapper** (`app/package.json`, `app/js/nodewebkit-main.js`) — packages the web app as a desktop app via nw.js

### Key Files

- `app/js/index.js` — Angular module definition (`typerApp`), wires up all dependencies
- `app/js/typer.services.js` — Two factories: `typerData` (shared state/model) and `typerLogic` (pure calculation functions: WPM, percentage, progress portions)
- `app/js/typer.controllers.js` — `GlobalCtrl` (keypress handling, timer, progress, finish detection), `StatsCtrl` (timer start/stop), `ModalCtrl` (text input modal, auto-opens on load)
- `app/js/typer.directives.js` — `letter` directive (one per character, handles keypress matching, mistake tracking, auto-advance after 5 errors), `test` directive (debug button)
- `app/js/oldTyper.js` — Pre-Angular jQuery/Firebase implementation (not loaded in current app, excluded from tests)
- `app/views/index.html` — Main template with `ng-repeat` over characters, progress bar, timer
- `app/views/modal.html` — Text input modal template

### Data Flow

1. Modal opens → user pastes text → `refactorTxt()` normalizes whitespace and trims to 1200 char limit
2. Text stored in `typerData.textContent`, split into characters via `ng-repeat`
3. Each character rendered as a `<letter>` directive that listens for `typer-keypress` broadcast
4. Only the active letter (where `$parent.$index === count`) processes input
5. Correct keystroke → advances counter; incorrect → increments mistakes (auto-skips after 5)
6. `GlobalCtrl` watches `letterCount.num` to detect completion, broadcasts `timer-stop`

## Build System (v1)

Uses Grunt + Bower (no npm scripts). Requires `npm install` then `bower install`.

```bash
grunt check          # JSHint linting
grunt dist-mac       # Build macOS .app via node-webkit
grunt dist-linux     # Build Linux distribution
grunt dist-win       # Build Windows distribution
```

## Tests (v1)

Karma + Jasmine. Tests cover `typerLogic` service (WPM calculation, percentage, progress portions).

```bash
npx karma start                    # Watch mode (requires Chrome)
npx karma start --single-run      # Single run
```

Test config: `karma.conf.js` — loads Angular + mocks from bower_components.

## Code Style (v1)

- JSHint configured via `.jshintrc` (strict mode, single quotes, camelCase, 4-space indent)
- `.editorconfig` for consistent formatting
