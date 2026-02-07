// Instance configuration for OpenQuizzer.
// Edit this file to customize your quiz — title, description, and content catalog.
// See README.md for the full content format.

export const CONFIG = {
  title: "OpenQuizzer",
  description:
    "A fast, mobile-friendly quiz app. Edit config.js and add content JSON files to make it yours.",
  // maxProblems: 10, // Optional: Limit "Practice All" sessions to this many problems
  units: [
    {
      id: 1,
      title: "Sample Unit",
      chapters: [{ num: 1, title: "Sample Chapter", ready: true }],
    },
  ],
};
