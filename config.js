// Instance configuration for OpenQuizzer.
// Edit this file to customize your quiz — title, description, and content catalog.
// See README.md for the full content format.

export const CONFIG = {
  title: "OpenQuizzer",
  description:
    "A fast, mobile-friendly quiz app. Edit config.js and add content JSON files to make it yours.",
  // maxProblems: 10, // Optional: Limit "Practice All" sessions to this many problems
  // timeLimit: 60, // Optional: Default seconds per question (0 or omit = disabled)
  // timeLimitOptions: [45, 60, 90], // Optional: Let learners choose a timer (Off is included)
  // Optional: Opens a prefilled GitHub Issue Form for structured problem reports.
  // problemReporting: {
  //   repository: 'owner/repository',
  //   issueTemplate: 'problem-report.yml',
  //   categories: ['Too easy', 'Distractors make the answer too obvious', 'Ambiguous or incorrect', 'Other'],
  // },
  // Optional: weighted probability for question types (default: 1)
  // typeWeights: {
  //   "multiple-choice": 1,
  //   "numeric-input": 1,
  //   "ordering": 1,
  //   "multi-select": 1,
  //   "two-stage": 1,
  // },
  units: [
    {
      id: 1,
      title: "Sample Unit",
      chapters: [{ num: 1, title: "Sample Chapter", ready: true }],
    },
  ],
};
