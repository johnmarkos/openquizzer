# AGENTS.md

Guidance for agents working on this repository.

## Project Overview

**OpenQuizzer** is a zero-dependency, mobile-friendly quiz engine and template repo. Anyone can create a quiz site by clicking "Use this template" on GitHub, editing `config.js`, adding content JSON files, and deploying to GitHub Pages. No build step, no npm, no framework.

Supports 5 question types: multiple choice, numeric input, ordering, multi-select, and two-stage. Automatic light/dark mode.

## Development

No build system. Edit files directly and push to `main` for deployment.

**Formatting:** Use Prettier standard formatting. Run `npx prettier --write .` before committing.

- Single quotes
- 2 space indent
- No trailing whitespace

**Local preview:** Content loads via `fetch()`, so you need a local server (e.g., `python3 -m http.server`). Opening `index.html` via `file://` won't load problems.

**Tests:** `node --test openquizzer.test.js` — 48 tests covering the engine. Zero dependencies, uses Node's built-in test runner (Node 20+). Run tests after any engine changes.

**Testing philosophy (Goldilocks):** Write meaningful tests that verify important behavior and prevent regressions. Not too many (don't test implementation details), not too few (don't skip edge cases that have bitten us). Good targets: state machine transitions, grading correctness for all question types, numeric parsing edge cases, event payloads. Use factory functions for test data and the `collectEvents` pattern for event-driven assertions.

## Architecture

Three files, no frameworks:

- **`openquizzer.js`** — Quiz engine ES module. Manages state machine (`idle → practicing → answered → complete`), grading, scoring, and shuffle logic. Emits events, never touches the DOM. Tested independently.
- **`index.html`** — All HTML, CSS, and UI logic. Imports the engine and config, renders questions based on engine events, delegates user actions to engine methods. Generic across all instances — never contains instance-specific content.
- **`config.js`** — Instance-specific configuration: title, description, optional back-link, and the units/chapters catalog. This is the only file that differs between instances.

Content lives in `content/` as JSON files. The `units` array in `config.js` defines the topic structure.

**Engine/UI boundary:** The engine emits events with all data the UI needs to render. The UI should never need to reach back into the engine for display info. This is the core design constraint.

**Readability is a nonfunctional requirement.** Code should be legible to humans, weaker models, and future maintainers without needing the full project context. Concretely: use section headers to group related code, add doc comments on non-obvious algorithms, choose method names that describe what the code does (not what the caller uses it for), label conditional branches, and avoid single-letter variable names outside tight loops. When in doubt, a short comment is better than making the reader trace through code to understand intent.

## Canonical Source

**This repo is canonical** for the engine (`openquizzer.js`, `openquizzer.test.js`) and generic UI (`index.html`). Instances (like System Design Practice) upgrade by copying these three files — `config.js` and `content/` are untouched.

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

## Commit Attribution

Commit messages from coding agents should include a line in this format:

`Co-authored by <model> in <tool>`

If not all attribution details are available, include the best available information (for example, `Co-authored by Cascade in Windsurf` or `Co-authored by Cascade`).

## Roadmap & Changelog

Future features are tracked in `ROADMAP.md`. Completed work is recorded in `CHANGELOG.md`.

## Maintaining This File

**This AGENTS.md is a living document.** At the end of each session or milestone:

1. **Capture insights** — If you learned something reusable (a pattern that worked, a mistake to avoid), add it here.
2. **Trim cruft** — Remove anything obvious, outdated, or low-value.
3. **Refine structure** — If a section is getting unwieldy, reorganize.

The goal: a future agent instance should be productive faster because of what we learned.

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
- Test fixtures as factory functions (`mcProblem('id', correct)`) keep tests concise
- The `collectEvents` pattern (register listener, return array, assert after actions) works well for event-driven APIs
- Test through shuffling by reading `quiz.problem` to get the current problem — don't assume problem order
- **Initialization matters:** When changing interaction models (e.g., tap-to-fill -> sortable list), ensure the internal state (like `#orderingOrder`) is initialized immediately.
- **HTML/JS sync:** When changing UI components (e.g., replacing 'Reset' with 'Submit'), verify both the HTML structure and the JS element references match.


**Readability review:**

- Rename methods to match what they actually do, not what the caller conceptually wants — `#showCurrentQuestion` became `#emitCurrentQuestion` because the engine doesn't show anything
- Group DOM element references by view/section with mini-comments — a wall of 35 `getElementById` calls is hard to navigate
- Label default/fallback branches in conditional chains — the "else" at the end of a tolerance check isn't obviously "default 50%"
- Single-letter variables (`s`, `p`) are fine in lambdas but not in named methods — use descriptive names (`finalScore`)
- Inline comments on non-obvious string operations prevent readers from having to mentally execute the code

**Dead code removal:**

- When features evolve, old code paths become orphaned — search for unused functions/elements during code review
- Remove dead code promptly; it confuses future readers and accumulates

**Results export:**

- Prefer a normalized export shape (`userAnswer`/`correctAnswer`) across question types so the UI can render summaries without type-specific branching everywhere.
- Include session export data in the `complete` event payload to preserve the engine/UI event boundary.
- For phone-first flows, support partial-session exports by reading `getSessionSummary()` before completion instead of coupling export to only the `complete` event.
- For readability, prefer `switch` when mapping behavior by question type; it is easier for non-experts to scan than long `if/else` chains.
