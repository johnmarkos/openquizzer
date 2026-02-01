# CLAUDE.md

Guidance for Claude Code working on this repository.

## Project Overview

**OpenQuizzer** is a zero-dependency, mobile-friendly quiz engine and template repo. Anyone can create a quiz site by clicking "Use this template" on GitHub, adding content JSON files, and deploying to GitHub Pages. No build step, no npm, no framework.

Supports 5 question types: multiple choice, numeric input, ordering, multi-select, and two-stage. Automatic light/dark mode.

## Development

No build system. Edit files directly and push to `main` for deployment.

**Local preview:** Content loads via `fetch()`, so you need a local server (e.g., `python3 -m http.server`). Opening `index.html` via `file://` won't load problems.

**Tests:** `node --test openquizzer.test.js` — 48 tests covering the engine. Zero dependencies, uses Node's built-in test runner (Node 20+). Run tests after any engine changes.

**Testing philosophy (Goldilocks):** Write meaningful tests that verify important behavior and prevent regressions. Not too many (don't test implementation details), not too few (don't skip edge cases that have bitten us). Good targets: state machine transitions, grading correctness for all question types, numeric parsing edge cases, event payloads. Use factory functions for test data and the `collectEvents` pattern for event-driven assertions.

## Architecture

Two files, no frameworks:

- **`openquizzer.js`** — Quiz engine ES module. Manages state machine (`idle → practicing → answered → complete`), grading, scoring, and shuffle logic. Emits events, never touches the DOM. Tested independently.
- **`index.html`** — All HTML, CSS, and UI logic. Imports the engine, renders questions based on engine events, delegates user actions to engine methods.

Content lives in `content/` as JSON files. The `UNITS` array in `index.html` defines the topic structure.

**Engine/UI boundary:** The engine emits events with all data the UI needs to render. The UI should never need to reach back into the engine for display info. This is the core design constraint.

## Canonical Source

**System Design Practice** (`nhoj.com/ai-code/system-design-practice/`) is the canonical source for the engine. When `openquizzer.js` or `openquizzer.test.js` change there, those changes must be copied here. This repo should always have the latest engine.

Instances created from this template are independent — they don't auto-update. This is acceptable for a single-file engine.

## Content Format

Problems live in `content/unit-{unitId}-chapter-{chapterNum}.json`. See `README.md` for the full JSON format for all 5 question types.

## Self-Review Loop

After completing each milestone, switch to a **reviewer role** and critique your own work harshly. Look for:

- Bugs in engine logic (grading, state transitions, edge cases)
- Dead code or unused fields after refactors
- API surface that doesn't match what the UI actually needs
- Missing test coverage for new functionality

Fix issues. Review again. **Iterate until the reviewer finds nothing significant.**

**Escape hatch:** If the same issue recurs or you're uncertain, flag it for human review and move on.

## Roadmap

Future features are tracked in `ROADMAP.md`. When flagging something for later, add it there.

## Maintaining This File

**This CLAUDE.md is a living document.** At the end of each session or milestone:

1. **Capture insights** — If you learned something reusable (a pattern that worked, a mistake to avoid), add it here.
2. **Trim cruft** — Remove anything obvious, outdated, or low-value.
3. **Refine structure** — If a section is getting unwieldy, reorganize.

The goal: a future Claude instance should be productive faster because of what we learned.

## Lessons Learned

Insights captured from development:

**Engine extraction:**
- When splitting MIXED functions (part logic, part DOM), the engine emits events with all data the UI needs — the UI should never need to reach back into the engine for display info
- Store defensive copies of caller-provided arrays (`[...problems]`) — the caller may mutate the original
- Watch for dead fields after extraction: if a field is set but never read (no getter, no internal use), delete it
- `loadProblems()` shouldn't accept parameters the engine doesn't use — keep the API honest
- Guard against division by zero in numeric grading when `correctValue === 0`

**Testing:**
- Node's built-in test runner (`node:test`) is sufficient for a zero-dependency project
- Node 24+ detects ES modules natively; Node 20 needs `--experimental-detect-module`
- Test fixtures as factory functions (`mcProblem('id', correct)`) keep tests concise
- The `collectEvents` pattern (register listener, return array, assert after actions) works well for event-driven APIs
- Test through shuffling by reading `quiz.problem` to get the current problem — don't assume problem order

**Dead code removal:**
- When features evolve, old code paths become orphaned — search for unused functions/elements during code review
- Remove dead code promptly; it confuses future readers and accumulates
