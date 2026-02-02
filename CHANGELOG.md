# Changelog

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
