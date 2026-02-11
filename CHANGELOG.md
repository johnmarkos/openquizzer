# Changelog

## v2.8: Session History & Aggregate Dashboard

- Added **session history with localStorage** — auto-save session summaries on complete, auto-load on startup; configurable `CONFIG.storageKey` for per-instance isolation
- Added **paste-back import** — "Import History" UI accepts pasted JSON (single object or array), validates structure, deduplicates by timestamp
- Added **aggregate stats engine** — exported `computeAggregateStats()` computes cumulative accuracy by question type, tag, unit, and chapter; trend over time; most-missed problem IDs (top 10 by wrong count)
- Added **Progress Dashboard** view — overview stats, recent sessions trend (last 10), breakdowns by type/tag/unit, most-missed problems; accessible from landing page and results page
- Added **combined export** — "Export All History" copies full session array to clipboard
- Added **clear data** — "Clear History" with confirmation dialog; removes localStorage data
- Added exported utilities: `validateSessionSummary()`, `deduplicateSessions()`, `computeAggregateStats()`
- Added 54 new tests (validation, deduplication, aggregate stats, UI wiring) — 174 total, all passing

## v2.7: Single-Session Feedback

- Added **skip button** — skip a problem without penalty; skipped count tracked separately from wrong answers and shown on results page
- Added **results breakdown by question type** — accuracy grouped by type (e.g., "numeric-input: 60%, ordering: 90%") on the results page
- Added **results breakdown by tag** — accuracy grouped by tag when problems have optional `tags` arrays; graceful no-op when absent
- Added **session context** — `loadProblems()` accepts optional context (chapter title, unit info); included in `getSessionSummary()` for self-describing exports
- Added **tags passthrough** — per-result `tags` array in session summary for downstream aggregation
- Updated **summary text** — `[Skipped]` verdicts, type/tag breakdown sections appended to human-readable summary
- Added 21 new tests (14 engine + 7 UI wiring) — 120 total, all passing
- Added example `tags` to all sample content problems

## v2.6: UI Wiring Contract Tests

- Added static contract tests that read `index.html` as a string and verify critical UI wiring exists
- Tests cover: 16 function definitions, 9 engine event listeners, 5 DOM event bindings, 5 element references, 1 agent artifact check (36 tests total)
- Would have caught the v2.4 accidental deletion of ~200 lines of UI code that all 59 engine tests missed
- Zero new dependencies — uses `node:fs` to read file, simple string/regex checks
- Runs in existing pre-commit hook, adds <5ms to test suite

## v2.5: Export/Show Results

- Added engine `getSessionSummary()` API with timestamp, score, and normalized per-question result details
- Added `sessionSummary` payload to the engine `complete` event for UI consumption
- Added results view export tools: `Copy JSON` and `Show Summary`
- Added clipboard copy fallback behavior when async clipboard APIs are unavailable
- Added tests for session summary structure and complete-event summary payload

## v2.4: Selection-Based Reordering (Keyboard Accessibility)

- Replaced "Tap to Rank" with "Selection-Based Reordering" for Ordering questions
- Accessible via keyboard: Tab to enter list, Arrow keys to navigate, Space/Enter to select/swap/confirm
- Mobile-friendly: Tap to select, tap another to swap
- Engine now initializes ordering items immediately upon load
- Added explicit "Submit Order" button
- Removed auto-grading and "Reset" button in favor of explicit submission

## Agent instruction migration (2026-02-07)

- Added `AGENTS.md` as the canonical instruction file by porting existing `CLAUDE.md` guidance.
- Generalized Claude-specific wording to agent-neutral language.
- Added `Commit Attribution` guidance for agent-generated commits.
- Replaced `CLAUDE.md` contents with a compatibility pointer to `AGENTS.md`.

## v2.3: Weighting system

- New `CONFIG.typeWeights` option to control question type probability
- Allows increasing frequency of rare question types (e.g. numeric, ordering)
- Setting weight to 0 removes a type from sessions entirely

## v2.2: Session length cap

- New `CONFIG.maxProblems` option to limit "Practice All" sessions to a set number of questions (default: unlimited)
- Useful for quick practice sessions or limiting session length for students
- Works with weighted shuffling to ensure balanced question types even in short sessions

## v2.1: Configurable problem ID display

- New `CONFIG.showProblemId` option shows problem ID above each question (off by default)
- Useful for instances where users need to reference specific problems for issue reporting

## v2: config.js separation

- Extracted all instance-specific content (title, description, units, back-link) into `config.js`
- `index.html` is now fully generic — copyable across instances with zero merge conflicts
- Upgrade path: copy `openquizzer.js`, `openquizzer.test.js`, `index.html` from this repo to any instance
- System Design Practice is now a proper OpenQuizzer instance

## v1: Initial release

- Engine with 5 question types (MC, numeric, ordering, multi-select, two-stage)
- State machine, event system, weighted shuffle
- Generic template UI with light/dark mode
- 48 engine tests
- README with quick start, content format, API docs
- Sample content demonstrating all question types
