# OpenQuizzer

A fast, mobile-friendly quiz app you can deploy in minutes. No build step, no runtime dependencies, no framework. Just HTML, CSS, and a single JavaScript module.

Supports 5 question types: multiple choice, numeric input, ordering, multi-select, and two-stage. Automatic light/dark mode. Works great on phones.

## Quick Start

1. Click **"Use this template"** on GitHub to create your own repo
2. Edit `config.js` with your title, description, and topic structure
3. Add content JSON files to `content/` (see format below)
4. Enable GitHub Pages (Settings > Pages > Source: main branch) to deploy

To preview locally, start a server (content loads via `fetch`):

```
python3 -m http.server
```

Then open `http://localhost:8000`.

## Dependency Model

- Runtime/app: zero dependencies.
- Engine tests: zero dependencies (uses Node's built-in test runner).
- Contributor tooling: one dev dependency (`prettier`) used by the repo's pre-commit hook for formatting checks.

This means quiz instances created from the template stay dependency-free, while contributor workflows use lightweight dev tooling for consistency.

For contributors:

```
npm install
```

`npm install` runs `prepare` to configure `core.hooksPath=.githooks` for this clone.

The shared hook in `.githooks/pre-commit` runs:

- `prettier --check` on staged source/docs files
- `node --test openquizzer.test.js`

## Content Format

Content lives in JSON files in `content/`. Each file represents a chapter:

```
content/unit-1-chapter-1.json
content/unit-1-chapter-2.json
content/unit-2-chapter-1.json
```

The filename must match the pattern `unit-{unitId}-chapter-{chapterNum}.json`.

### Chapter structure

```json
{
  "chapterTitle": "My Chapter",
  "chapterDescription": "A short description shown during practice",
  "problems": [ ... ]
}
```

### Question types

**Multiple choice** (default if `type` is omitted):

```json
{
  "id": "mc-001",
  "type": "multiple-choice",
  "question": "What is the capital of France?",
  "options": ["London", "Paris", "Berlin", "Madrid"],
  "correct": 1,
  "explanation": "Paris has been the capital of France since the 10th century."
}
```

**Numeric input** (supports K/M/B/T suffixes from users):

```json
{
  "id": "num-001",
  "type": "numeric-input",
  "question": "How many seconds in a day?",
  "answer": 86400,
  "unit": "seconds",
  "tolerance": 0.1,
  "explanation": "24 * 60 * 60 = 86,400 seconds."
}
```

Tolerance options:

- `"exact"` -- must match exactly
- `"order-of-magnitude"` -- within 10x either direction
- A number like `0.1` -- within 10% of the correct answer
- Omit for default 50% tolerance

**Ordering** (rank items):

```json
{
  "id": "ord-001",
  "type": "ordering",
  "question": "Order from smallest to largest:",
  "items": ["KB", "MB", "GB", "TB"],
  "correctOrder": [0, 1, 2, 3],
  "explanation": "KB < MB < GB < TB, each 1000x the previous."
}
```

`correctOrder` is an array of indices into `items`, representing the correct sequence. Items are shuffled automatically for display.

**Multi-select** (multiple correct answers):

```json
{
  "id": "ms-001",
  "type": "multi-select",
  "question": "Which are prime numbers?",
  "options": ["2", "4", "7", "9"],
  "correctIndices": [0, 2],
  "explanation": "2 and 7 are prime. 4 = 2*2 and 9 = 3*3."
}
```

**Two-stage** (sequential dependent questions):

```json
{
  "id": "ts-001",
  "type": "two-stage",
  "stages": [
    {
      "question": "What is 2 + 2?",
      "options": ["3", "4", "5"],
      "correct": 1,
      "explanation": "2 + 2 = 4."
    },
    {
      "question": "Now multiply your answer by 3. What do you get?",
      "options": ["9", "12", "15"],
      "correct": 1,
      "explanation": "4 * 3 = 12."
    }
  ]
}
```

## Configuring Your Quiz

Edit `config.js`:

```js
export const CONFIG = {
  title: "My Quiz",
  description: "A short description shown on the landing page.",
  // Optional: renders a navigation link above the landing page
  // backLink: { href: '../', text: '\u2190 Back' },
  units: [
    {
      id: 1,
      title: "Geography",
      chapters: [
        { num: 1, title: "Capitals", ready: true },
        { num: 2, title: "Rivers", ready: true },
        { num: 3, title: "Mountains", ready: false }, // not yet created
      ],
    },
    {
      id: 2,
      title: "History",
      chapters: [{ num: 1, title: "Ancient World", ready: true }],
    },
  ],
};
```

Each chapter with `ready: true` needs a corresponding JSON file in `content/`. Chapters with `ready: false` appear grayed out. A "Practice All" button appears automatically when a unit has 2+ ready chapters.

### Customizing Weights

You can optionally control the probability of each question type appearing in a session. Add `typeWeights` to `CONFIG`:

```js
  typeWeights: {
    "multiple-choice": 1,
    "numeric-input": 5, // Appear 5x more often
    "ordering": 0,      // Never appear
  },
```

Default weight is `1` for any type not listed. Setting a weight to `0` removes that type from the session entirely.

## Customizing the Look

All styling is in the `<style>` block of `index.html`. The design uses CSS custom properties for theming:

```css
:root {
  --bg: #0d1117; /* background */
  --accent: #58a6ff; /* buttons, highlights */
  --success: #3fb950; /* correct answers */
  --error: #f85149; /* incorrect answers */
  /* ... */
}
```

Change these values to match your brand. The `@media (prefers-color-scheme: light)` block defines the light mode palette.

## Engine API

The quiz engine (`openquizzer.js`) is a standalone ES module with no DOM dependencies. You can use it to build a completely different UI.

```js
import { OpenQuizzer } from "./openquizzer.js";

const quiz = new OpenQuizzer();

quiz.loadProblems(problems);
quiz.start();

quiz.on("questionShow", ({ problem, type }) => {
  /* render */
});
quiz.on("optionSelected", ({ correct, explanation }) => {
  /* feedback */
});
quiz.on("complete", ({ correct, total, percentage }) => {
  /* results */
});
```

### State machine

```
idle  -->  practicing  -->  answered  -->  complete
              ^   retry   |                  |
              |___________back_______________|
```

### Methods

| Method                      | Description                               |
| --------------------------- | ----------------------------------------- |
| `loadProblems(problems)`    | Load an array of problem objects          |
| `start()`                   | Begin the session                         |
| `next()`                    | Advance to next question (or complete)    |
| `retry()`                   | Reshuffle and restart                     |
| `reset()`                   | Return to idle                            |
| `selectOption(index)`       | Answer MC or two-stage question           |
| `toggleMultiSelect(index)`  | Toggle a multi-select option              |
| `submitMultiSelect()`       | Grade multi-select answer                 |
| `submitNumeric(string)`     | Grade numeric answer (parses K/M/B/T)     |
| `moveOrderingItem(from,to)` | Move an ordering item                     |
| `submitOrdering()`          | Grade ordering answer                     |
| `getSessionSummary()`       | Return exportable session results summary |

### Getters

| Getter     | Returns                                                    |
| ---------- | ---------------------------------------------------------- |
| `state`    | `'idle'` \| `'practicing'` \| `'answered'` \| `'complete'` |
| `progress` | `{ current, total }`                                       |
| `score`    | `{ correct, total, percentage }`                           |
| `problem`  | Current problem object (null in idle/complete)             |
| `answers`  | Array of answer records                                    |

### Events

| Event               | When                          |
| ------------------- | ----------------------------- |
| `stateChange`       | Any state transition          |
| `questionShow`      | New question ready to display |
| `optionSelected`    | MC or two-stage answer graded |
| `twoStageAdvance`   | Between two-stage parts       |
| `numericResult`     | Numeric answer graded         |
| `multiSelectToggle` | Multi-select option toggled   |
| `multiSelectResult` | Multi-select answer graded    |
| `orderingUpdate`    | Ordering item placed/removed  |
| `orderingResult`    | Ordering answer graded        |
| `complete`          | Session finished              |

## Tests

The engine tests use Node's built-in test runner:

```
node --test openquizzer.test.js
```

No test dependencies needed. Requires Node 20+.

MIT

## Contributing

See [AGENTS.md](AGENTS.md) for coding standards, architecture details, and verification guidelines.
