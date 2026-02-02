# Roadmap

Future features and improvements for OpenQuizzer.

## New Question Types

**Fill-in-the-blank**
- Show a sentence with a blank, user types the missing word/phrase
- Exact match or accept multiple valid answers
- Good for vocabulary, terminology, definitions
- Priority: High (most-requested type for educational content)

**Matching / Connect pairs**
- Two columns, user draws connections between items
- Mobile UX: tap one from each column to pair them
- Grading: all-or-nothing vs. partial credit per pair
- Priority: Medium

**Image-based questions**
- Display an image as part of the question (diagrams, charts, maps)
- Answer types: MC, numeric, or hotspot (tap a region)
- Requires: image path field in problem JSON, responsive display
- Priority: Medium (depends on content needs)

**Timed questions**
- Optional countdown timer per question
- Configurable per-problem or per-chapter
- Show time taken in results summary
- Priority: Low (nice-to-have for exam prep)

## Engine Improvements

**Partial credit scoring**
- Ordering: credit for items in correct relative position
- Multi-select: credit for each correct toggle minus incorrect
- Current: all-or-nothing for ordering and multi-select
- Priority: Medium

**Question history / skip**
- Allow users to skip a question and return to it
- Track skipped vs. answered in results
- Priority: Low

## Template / UX Improvements

**Progress persistence**
- Resume interrupted sessions via localStorage
- Track completion per chapter
- Priority: Medium

**Review mode**
- Review missed questions at end of session
- Bookmark problems for later review
- Priority: Medium

**Keyboard accessibility for ordering questions**
- Current: tap-to-order only (touch/mouse)
- Needed: arrow keys to select, Enter to place, Escape to deselect
- Priority: Medium (accessibility compliance)

---

*This file is referenced from CLAUDE.md. Update when flagging features for future work. Completed items go in CHANGELOG.md.*
