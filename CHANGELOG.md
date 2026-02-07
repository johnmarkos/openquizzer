# Changelog

## Agent instruction migration (2026-02-07)

- Added `AGENTS.md` as the canonical instruction file by porting existing `CLAUDE.md` guidance.
- Generalized Claude-specific wording to agent-neutral language.
- Added `Commit Attribution` guidance for agent-generated commits.
- Replaced `CLAUDE.md` contents with a compatibility pointer to `AGENTS.md`.

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
