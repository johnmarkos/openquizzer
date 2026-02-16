# Roadmap

Future features and improvements for OpenQuizzer. Completed work is in `CHANGELOG.md`.

## Future (v3.0: File Import/Export & Advanced Features)

- [ ] **Download/upload progress** — Download progress as a `.json` file. Upload to import on another device or after clearing browser data. Merge with existing localStorage data.
- [ ] **Partial credit scoring** — Ordering: credit for items in correct relative position. Multi-select: credit for each correct toggle minus incorrect
- [ ] **Review mode** — Review missed questions at end of session. Bookmark problems for later review
- [ ] **Fill-in-the-blank** — Show a sentence with a blank, user types the missing word/phrase. Exact match or accept multiple valid answers
- [ ] **Matching / Connect pairs** — Two columns, user draws connections between items. Mobile UX: tap one from each column to pair them
- [ ] **Adaptive difficulty** — Use Elo proficiency scores (v2.9) to drive problem selection: target weak areas, avoid over-drilling mastered topics
- [ ] **Offline support** — Service worker for full offline functionality
- [ ] **Streak tracking** — Daily practice streaks with visual indicator

## Requested by Instances

- [ ] **Interview case mode (linked prompts)** — Support a single evolving case with 4-8 linked prompts where new constraints appear mid-session (e.g., "traffic spike", "compliance requirement"). Preserve context across prompts and score both correctness and adaptation quality.
- [ ] **Confidence capture + calibration metrics** — Optional confidence input per answer (e.g., low/medium/high) and dashboard metrics that compare confidence vs correctness to expose overconfidence and guide review priority.
- [ ] **Blueprint coverage planner** — Allow instances to define target coverage weights (tags/units/chapters) and report under-practiced areas directly in the dashboard so users can train to an interview blueprint instead of random volume.

## Exploring

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

_Completed items go in CHANGELOG.md. Update when flagging features for future work._
