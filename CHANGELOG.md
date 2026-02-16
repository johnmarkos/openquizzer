# Changelog

## v2.9 Batch 2 Review Fixes (Pass 3)

- **Problem metadata persistence** — `allProblemsById` now saved to localStorage on chapter load and restored on page init. Weakest-areas dashboard shows question previews even when the user navigates directly to the dashboard without loading chapters first. Cleared alongside other history data.
- **Lint templated-phrase detection** — `content-lint.js` now detects chapters where a high fraction of explanations share the same opening phrase (>=30% of problems), flagging likely generated/templated language. Configurable thresholds.
- Added 3 new wiring tests — **253 total tests**, all passing.

## v2.9 Batch 2 Review Fixes (Pass 2)

- **Proficiency/SR clamping** — `daysSince` clamped to >= 0, proficiency output clamped to [0, 1], SR weights clamped to [1, 2]. Prevents future timestamps (clock skew, manual import) from producing out-of-range values.
- **Two-stage weakest-areas fallback** — Metadata collector uses `p.question || p.stages?.[0]?.question || ""` so two-stage problems show meaningful preview text in the dashboard instead of empty strings.
- **Two-stage reference fallback** — Final two-stage feedback emits `stage.references || problem.references`, falling back to problem-level references when the stage has none.
- **Lint repeated-word check** — `content-lint.js` now detects case-insensitive adjacent duplicate words ("For For", "Apply apply") with an allowlist for legitimate doubles ("had had", "that that").
- Added 3 new tests (2 future-timestamp clamping, 1 reference fallback) — **250 total tests**, all passing.

## v2.9 Batch 2: Proficiency Scores & Spaced Repetition

### Proficiency Scores

- Added exported **`computeProficiency(trackingEntry, now)`** — pure function computing a 0–1 proficiency score from accuracy and recency. Formula: `accuracy × confidence + 0.5 × (1 − confidence)` where `confidence = e^(−0.1 × daysSinceLastSeen)`. Decays toward 0.5 (uncertain) over time. Returns 0.5 for unseen/null entries.
- Added exported **`computeWeakestAreas(problemTracking, problemsById, limit, now)`** — returns lowest-proficiency problems sorted ascending. Replaces session-based "most missed" with a recency-aware ranking.

### Spaced Repetition

- Added exported **`computeSRWeights(problems, problemTracking, now)`** — computes per-problem weight (1.0 for mastered → 2.0 for weak/unknown). Unseen problems get 1.5 (slightly favored). All problems keep weight ≥ 1.0, so nothing is excluded.
- Modified **`weightedShuffle`** — new optional 3rd parameter `problemWeights` biases selection within type queues. Type weights and problem weights compose independently.
- Modified **`loadProblems`** — new optional 4th parameter `problemTracking`. When provided, computes SR weights and passes them to shuffle. Stored for reuse in `retry()`.
- Modified **`retry()`** — recomputes SR weights from stored tracking when available.

### Dashboard: Weakest Areas

- **Replaced "Most Missed" with "Weakest areas"** on the Progress Dashboard — now shows proficiency-aware ranking using `computeWeakestAreas` instead of session-level wrong counts
- Each entry shows proficiency percentage and attempt counts (e.g., "42% proficiency (3/7)")
- Added **problem metadata collection** — `allProblemsById` map built during chapter loads, providing question text for weakest-areas display
- Both `loadProblems` call sites (Practice All and single chapter) now pass `problemTracking` for SR-weighted shuffling

### Test Coverage

- Added 13 new engine tests: 6 proficiency, 3 weakest areas, 3 SR weights, 3 SR integration, 3 new import wiring tests
- Updated UI wiring: `renderWeakestAreas` replaces `renderMostMissed` in required functions

## v2.9 Batch 1: Timed Mode, Resume Sessions, Per-Problem Tracking

### Timed Mode

- Added optional **`CONFIG.timeLimit`** — seconds per question for interview pressure simulation (0 or omit = disabled)
- Added **countdown timer** in practice header with `font-variant-numeric: tabular-nums` for stable layout
- Timer enters **warning state** (red) at 25% time remaining
- Added engine **`timeout()` method** — records `{ timedOut: true, correct: false }`, emits `timeout` event, advances to next question
- Timed-out problems **excluded from score and breakdowns** (same treatment as skipped)
- Added `score.timedOut` count and `timedOut` in session summary results
- Added `totalTimedOut` to `computeAggregateStats()` — timed-out results excluded from per-problem stats
- Timer clears on answer, skip, timeout, quit, and session complete

### Resume Interrupted Sessions

- Added **`beforeunload` handler** — saves in-progress snapshot to localStorage when quiz is active
- Added **resume prompt** on landing page — shows chapter title and progress (e.g., "3/10 answered"), with Resume/Start Fresh buttons
- Added engine **`getSnapshot()`** — returns defensive copies of problems, answers, context, maxProblems
- Added engine **`restoreSession(snapshot)`** — restores full state from snapshot without reshuffling
- Added engine **`resume()`** — continues from saved position; auto-completes if all problems already answered
- Snapshot cleared on: session complete, back-to-menu, clear-history

### Per-Problem Tracking

- Added exported **`updateProblemTracking(existingTracking, sessionSummary)`** — pure function that computes `{ [problemId]: { seen, correct, lastSeen } }`
- Skipped and timed-out problems **not tracked** (only real attempts count)
- Returns new object (no mutation of input)
- Tracking **persisted to localStorage** (`storageKey + "-tracking"`), updated on session complete
- Cleared with "Clear History"
- Dashboard integration deferred — data collection is the priority for v2.9

### Test Coverage

- Added 25 new tests: 8 timeout, 8 snapshot/resume, 7 updateProblemTracking, 2 aggregate timedOut
- Added 12 new UI wiring tests: 6 function defs, 1 event registration, 5 element refs, 1 beforeunload
- Updated 5 existing score assertions to include `timedOut: 0`
- **229 total tests**, all passing

## Content QA Lint Script

- Added **`content-lint.js`** — zero-dependency Node CLI that scans `content/*.json` for quality risks before publish
- **7 checks:** structural validation (required fields, bounds), duplicate problem IDs (within and across chapters), duplicate question stems, single-correct multi-selects, repeated explanation templates, missing/invalid references, suspicious artifact text (TODO, FIXME, placeholder patterns)
- **Two output modes:** concise terminal summary (default) or machine-readable JSON (`--json` flag)
- Exit code 0 when clean, 1 when issues found
- Added `npm run lint:content` script

## v2.8.2: References (Further Reading Links)

- Added optional **`references`** field on problems — an array of `{ title, url }` objects for "further reading" links
- Either `references` or `detailedExplanation` (or both) triggers the **"Learn more" toggle**; they're independent
- Engine passes `references` through all 5 result event payloads alongside `detailedExplanation`; `undefined` when absent (fully backward-compatible)
- For two-stage problems, `references` is read from the individual stage object (same pattern as `detailedExplanation`)
- References render as a compact link list (`<ul class="references-list">`) with `target="_blank" rel="noopener"` links
- Added 7 new tests (6 engine + 1 UI wiring) — 189 total, all passing
- Added `references` to 2 sample problems in `content/unit-1-chapter-1.json`

## v2.8.1: Expandable Mini-Lessons

- Added optional **`detailedExplanation`** field on problems — supports HTML content for richer explanations
- Added **"Learn more" toggle** in feedback area — appears only when `detailedExplanation` is present; expands/collapses a detail section below the short explanation
- Engine passes `detailedExplanation` through all 5 result event payloads (`optionSelected`, `numericResult`, `multiSelectResult`, `orderingResult`, two-stage final); `undefined` when absent (fully backward-compatible)
- For two-stage problems, `detailedExplanation` is read from the individual stage object (not the top-level problem)
- Added 8 new tests (6 engine + 2 UI wiring)
- Added `detailedExplanation` to 3 sample problems in `content/unit-1-chapter-1.json`

## Simplify instance upgrade path (2026-02-10)

- Made `openquizzer.test.js` **copy-verbatim** for instances — meta tag tests now import CONFIG and check dynamically instead of hardcoding template placeholder values. Instances no longer need to swap tests after copying.
- Updated template `index.html` meta description to match `config.js` (was a stale placeholder).
- Instance upgrade is now: copy 3 files, edit 2 lines in `index.html` (`<title>` and `<meta description>`). No test edits needed.

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
