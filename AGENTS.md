# AGENTS.md

Guidance for agents working on this repository.

## Project Overview

**OpenQuizzer** is a zero-runtime-dependency, mobile-friendly quiz engine and template repo. Anyone can create a quiz site by clicking "Use this template" on GitHub, editing `config.js`, adding content JSON files, and deploying to GitHub Pages. No build step, no framework.

Supports 5 question types: multiple choice, numeric input, ordering, multi-select, and two-stage. Automatic light/dark mode.

## Development

No build system. Edit files directly. All changes to `main` go through pull requests (see Branching & Pull Requests).

**Formatting:** Use Prettier standard formatting. Install contributor tooling once with `npm install`, then run `npm run format` before committing.

- Single quotes
- 2 space indent
- No trailing whitespace

**Local preview:** Content loads via `fetch()`, so you need a local server (e.g., `python3 -m http.server`). Opening `index.html` via `file://` won't load problems.

**Tests:** `node --test openquizzer.test.js` — engine tests with Node's built-in test runner (Node 20+). No test dependencies required. Run tests after any engine changes.

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

**This repo is canonical** for the engine (`openquizzer.js`, `openquizzer.test.js`) and generic UI (`index.html`). Instances (like System Design Practice) upgrade by copying these three files, then updating the static `<title>` and `<meta description>` in `index.html` to match their `config.js`. All three files are otherwise copy-verbatim — no other edits needed.

Instances created from this template are independent — they don't auto-update. This is acceptable for a single-file engine.

## Content Format

Problems live in `content/unit-{unitId}-chapter-{chapterNum}.json`. See `README.md` for the full JSON format for all 5 question types.

## Self-Review Loop

After completing each milestone, switch to a **reviewer role** and critique your own work harshly. Look for:

- Bugs in engine logic (grading, state transitions, edge cases)
- Dead code or unused fields after refactors
- API surface that doesn't match what the UI actually needs
- Missing test coverage for new functionality
- Readability: descriptive names, section comments, labeled branches, no walls of undifferentiated code (see Readability section in Lessons Learned)

Fix issues. Review again. **Iterate until the reviewer finds nothing significant.**

**Escape hatch:** If the same issue recurs or you're uncertain, flag it for human review and move on.

## Branching & Pull Requests

All changes to `main` require a pull request. No direct commits to `main`.

- **Branch naming:** `feat/`, `fix/`, `chore/` prefixes (e.g., `feat/new-question-type`)
- **Before opening a PR:** run `npm test`, `npm run format:check`, and the self-review checklist
- **CI runs on every PR:** checkout → Node 20 → `npm ci` → `npm test` → `npm run format:check` → `npm run lint:content`
- **Branch protection** is configured in the GitHub UI (require PRs, require CI status check)
- **After opening a PR:** comment `@codex review` to trigger a Codex code review

## Multi-Model Workflow

This project uses multiple AI models with different roles:

- **Claude Opus 4.6** — Staff engineer. Architecture decisions, code review, AGENTS.md maintenance. Does thorough reviews after other models implement features.
- **GPT / Gemini / other models** — Volume implementation. Picks up tasks from ROADMAP.md or a prepared `TASK.md`, implements them following these guidelines, runs self-review.

### For implementers (any model):

1. Read this entire file before starting
2. Pick a task from ROADMAP.md or read `TASK.md` if one was prepared for you
3. No build system — edit files directly. Run `node --test openquizzer.test.js` — must pass
4. Run `npm run format` before committing
5. Run the self-review loop (see below) — fix everything found
6. Update CHANGELOG.md with what you did
7. Mark the ROADMAP task as done (`[x]`)
8. Write `HANDOFF.md` in the project root: what was completed, decisions made and why, anything unfinished, gotchas

### For staff reviews (Claude Opus):

1. Read every changed source file — not just diffs
2. Check all architecture rules: engine/UI boundary, zero-dependency engine, event-driven pattern
3. Verify test coverage matches current functionality
4. Check CHANGELOG.md accurately reflects what's in the code
5. Look for: DOM access in `openquizzer.js`, framework dependencies, UI logic leaking into the engine
6. Check readability: section headers, doc comments, descriptive names, labeled branches
7. Review AGENTS.md itself — update Lessons Learned, trim cruft
8. Flag anything needing a human decision

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
- Test through shuffling by reading `quiz.problem` to get the current problem — don't assume problem order
- **Initialization matters:** When changing interaction models (e.g., tap-to-fill -> sortable list), ensure the internal state (like `#orderingOrder`) is initialized immediately.
- **HTML/JS sync:** When changing UI components (e.g., replacing 'Reset' with 'Submit'), verify both the HTML structure and the JS element references match.
- To mitigate UI risk without browser tests, add engine-level export contract tests (shape, lifecycle states, defensive-copy behavior) so pre-commit catches regressions.
- **Static UI wiring tests beat heavyweight E2E for LLM-driven workflows.** Reading `index.html` as a string and checking for function definitions, `quiz.on("event"` registrations, and `addEventListener` bindings catches accidental deletions (especially LLM context truncation artifacts like `// ... existing code ...`) at near-zero cost. No browser, no Playwright, <5ms. Tests the agent, not the code.
- When string-matching Prettier-formatted code, use regex with `\s*` for patterns that Prettier may break across lines (e.g., `quiz.on(\n  "event"`). Simple `.includes()` is fine for patterns Prettier keeps on one line (e.g., `function name(`).
- Keep hooks versioned in `.githooks/` and use `npm prepare` to set `core.hooksPath`; this avoids local-only `.git/hooks` drift across clones.

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
