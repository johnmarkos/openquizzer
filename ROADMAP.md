# Roadmap

Future features and improvements for OpenQuizzer.

## Now (Next Release)

- [x] **Weighting system** — Configure probability weights per question type so minority types appear with reasonable frequency despite smaller counts
- [x] **Session length cap** — Optional `maxProblems` config to limit "Practice All" sessions (default: unlimited)
- [ ] **Keyboard accessibility for ordering** — Arrow keys to reorder, Enter to confirm

## Next (v1.1)

- [ ] **localStorage progress tracking** — Remember which problems user has seen, when, and score
- [ ] **Basic spaced repetition** — Surface problems user got wrong more frequently
- [ ] **Statistics view** — Show accuracy by chapter, question type, time period
- [ ] **Skip button** — Let users skip a problem without penalty (tracked separately)

## Later (v2+)

- [ ] **Partial credit scoring** — Ordering: credit for items in correct relative position. Multi-select: credit for each correct toggle minus incorrect
- [ ] **Review mode** — Review missed questions at end of session. Bookmark problems for later review
- [ ] **Fill-in-the-blank** — Show a sentence with a blank, user types the missing word/phrase. Exact match or accept multiple valid answers
- [ ] **Matching / Connect pairs** — Two columns, user draws connections between items. Mobile UX: tap one from each column to pair them
- [ ] **Adaptive difficulty** — Elo-style scoring per skill dimension, serve problems targeting weak areas
- [ ] **Offline support** — Service worker for full offline functionality
- [ ] **Import/export progress** — JSON export of user data for backup or device transfer
- [ ] **Timed mode** — Optional countdown per problem for interview pressure simulation
- [ ] **Streak tracking** — Daily practice streaks with visual indicator

## Maybe (Exploring)

- [ ] **Image-based questions** — Display an image as part of the question (diagrams, charts, maps). Answer types: MC, numeric, or hotspot
- [ ] **Visual element picker** — Click regions on an image (e.g., "identify the load balancer")
- [ ] **Trade-off sliders** — Multi-axis input for balancing constraints
- [ ] **Sequence/path builder** — Non-linear ordering for flow diagrams
- [ ] **LLM grading mode** — Optional API integration for free-text answers
- [ ] **Multiplayer** — Real-time head-to-head quizzing

## Won't Do (Out of Scope)

- Build systems or transpilation — stays zero-dependency
- User accounts or server-side storage — stays static
- Mobile apps — PWA is sufficient

---

_This file is referenced from CLAUDE.md. Update when flagging features for future work. Completed items go in CHANGELOG.md._
