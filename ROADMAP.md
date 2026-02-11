# Roadmap

Future features and improvements for OpenQuizzer.

## Done (v2.8: Session History & Aggregate Dashboard)

Session history with localStorage persistence, paste-back import/export, and a cross-session aggregate dashboard. Pulled forward localStorage features originally planned for v2.9 since they fit naturally with the import/aggregate work.

- [x] **Load previous sessions** — "Import History" UI that accepts pasted JSON (one or more session summaries). Parse, validate structure, deduplicate by timestamp.
- [x] **Aggregate stats engine** — Engine-side utilities (`validateSessionSummary`, `deduplicateSessions`, `computeAggregateStats`) that take an array of session summaries and compute: cumulative accuracy by question type, tag, unit, and chapter; trend over time; most-missed problem IDs. Returns a plain object the UI can render.
- [x] **Aggregate dashboard** — Progress Dashboard view showing cross-session insights: overview stats, recent sessions trend, accuracy breakdowns by type/tag/unit, most-missed problems. Accessible from landing page and results page.
- [x] **Combined export** — "Export All History" exports the full set of loaded sessions (current + imported) as a single JSON array.
- [x] **Auto-save sessions** — Save session summary to localStorage on complete. Same JSON format as paste-back export.
- [x] **Auto-load history on startup** — On page load, read saved sessions from localStorage and show history summary on landing page.
- [x] **Session history list** — Recent sessions shown in dashboard trend section: date, chapter, score.
- [x] **Clear data** — "Clear History" with confirmation dialog. Paste-back import/export still works as backup and cross-device transfer.

## Done (v2.7: Single-Session Feedback)

Enrich the results page with actionable feedback computed entirely from the current session. No persistence required. Every instance benefits immediately on engine/UI upgrade.

- [x] **Results breakdown by question type** — Show accuracy grouped by question type on the results page (e.g., "numeric-input: 60%, ordering: 90%"). Computed from existing session data; no content changes needed.
- [x] **Problem tags** — Optional `tags` array on problems (e.g., `["caching", "consistency"]`). Engine passes tags through in session summary results. Backward-compatible: no behavioral change if tags are absent. Instances add tags to their content at their own pace.
- [x] **Results breakdown by tag** — If problems have tags, show accuracy grouped by tag on the results page. "You nailed caching (95%) but struggled with consistency (40%)." Graceful no-op when tags are absent.
- [x] **Session summary includes context** — Extend `getSessionSummary()` to include chapter title, unit title, and per-problem tags. Makes summaries self-describing so they can be aggregated later without needing the original content files.
- [x] **Skip button** — Skip a problem without penalty. Tracked separately in results (skipped vs. wrong vs. correct). Skipped count shown on results page.

## Next (v2.9: Per-Problem Tracking & Spaced Repetition)

- [ ] **Per-problem tracking** — Track each problem's history across sessions (seen count, correct count, last seen timestamp). Foundation for spaced repetition.
- [ ] **Elo-style proficiency scores** — Compute a proficiency rating per area (chapter, unit, tag) from per-problem history. Accounts for problem difficulty and recency — getting a hard problem wrong hurts less than getting an easy one wrong, and recent sessions weigh more than old ones. Displayed on the aggregate dashboard so users can see where they are and where to focus.
- [ ] **Basic spaced repetition** — Weight problem selection by past performance. Problems the user got wrong appear more frequently in future sessions.
- [ ] **Resume interrupted sessions** — Save in-progress state on page unload, offer to resume on next load.

## Future (v3.0: File Import/Export & Advanced Features)

- [ ] **Download/upload progress** — Download progress as a `.json` file. Upload to import on another device or after clearing browser data. Merge with existing localStorage data.
- [ ] **Partial credit scoring** — Ordering: credit for items in correct relative position. Multi-select: credit for each correct toggle minus incorrect
- [ ] **Review mode** — Review missed questions at end of session. Bookmark problems for later review
- [ ] **Fill-in-the-blank** — Show a sentence with a blank, user types the missing word/phrase. Exact match or accept multiple valid answers
- [ ] **Matching / Connect pairs** — Two columns, user draws connections between items. Mobile UX: tap one from each column to pair them
- [ ] **Adaptive difficulty** — Use Elo proficiency scores (v2.9) to drive problem selection: target weak areas, avoid over-drilling mastered topics
- [ ] **Offline support** — Service worker for full offline functionality
- [ ] **Timed mode** — Optional countdown per problem for interview pressure simulation
- [ ] **Streak tracking** — Daily practice streaks with visual indicator

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

_This file is referenced from CLAUDE.md. Update when flagging features for future work. Completed items go in CHANGELOG.md._
