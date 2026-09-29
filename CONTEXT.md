# Domain glossary

Names for the concepts the code is organised around. Use these terms in code, tests, tickets and reviews.

## Typing

- **Test**: one timed or counted typing attempt in a given mode (time, words, quote, zen, custom, book). It ends exactly once and produces a **Result**.
- **Typing session**: the module that owns a test from first keystroke to completion: the keystroke fold, the clock, each mode's end rule, and refilling words in continuous modes. UI components wire DOM events into it and render its state.
- **End rule**: what finishes a test in a given mode. Time mode ends at its time limit, even if no key is pressed. Words and quote modes end on the last word. Zen ends on Esc. Book mode ends on Esc or when the book runs out.
- **Continuous mode**: a mode with no fixed end that the user finishes with Esc (zen, book).
- **Feed**: the source time, zen and book modes refill from as the user types (the word generator on the chosen word list, or a Book reader cursor).

## Books

- **Book reader**: the module that owns a reader's position in a book. It opens a book at the saved progress and hands out a cursor for the text. It commits the words actually typed, and reports the chapter and percent.
- **Committed position**: the chapter and word offset the reader has actually typed up to. Only a commit moves it, and it is what gets persisted as book progress.
- **Cursor**: a throwaway feed that starts at the committed position. The session reads ahead from it, and reading ahead never changes the committed position.
- **Book percent**: committed word offset divided by the book's total words.

## Horde (game mode)

- **Sim**: the pure, deterministic fixed-timestep simulation. `step()` is its only mutator.
- **Sim event**: a fact the sim reports about a tick (kill, breach, absorb, hit, powerup). Events are deterministic but are not part of the hashed game state.
- **Combo**: the kill streak that multiplies score and decays over ticks. Its decay window can be changed by perks.
- **HUD view**: a pure projection of game state into what the HUD shows (combo fraction, multiplier, boss, wave label).
