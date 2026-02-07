// Instance configuration for OpenQuizzer.
// Read and become familiar with AGENTS.md before making any changes to this codebase.
// Edit this file to customize your quiz — title, description, and content catalog.
// See README.md for the full content format.

export const CONFIG = {
  title: "OpenQuizzer",
  description:
    "A fast, mobile-friendly quiz app. Edit config.js and add content JSON files to make it yours.",
  // maxProblems: 10, // Optional: Limit "Practice All" sessions to this many problems
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
