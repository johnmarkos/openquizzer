import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  OpenQuizzer,
  validateSessionSummary,
  deduplicateSessions,
  computeAggregateStats,
} from "./openquizzer.js";
import { CONFIG } from "./config.js";

// =============================================
// Test fixtures
// =============================================

function mcProblem(id, correct = 1, { detailedExplanation, references } = {}) {
  const problem = {
    id,
    type: "multiple-choice",
    question: `MC ${id}`,
    options: ["A", "B", "C", "D"],
    correct,
    explanation: `Explanation for ${id}`,
  };
  if (detailedExplanation !== undefined)
    problem.detailedExplanation = detailedExplanation;
  if (references !== undefined) problem.references = references;
  return problem;
}

function numericProblem(
  id,
  { answer = 1000, tolerance = 0.1, unit = "ms" } = {},
) {
  return {
    id,
    type: "numeric-input",
    question: `Numeric ${id}`,
    answer,
    unit,
    tolerance,
    explanation: `Explanation for ${id}`,
  };
}

function orderingProblem(id) {
  return {
    id,
    type: "ordering",
    question: `Order ${id}`,
    items: ["First", "Second", "Third"],
    correctOrder: [0, 1, 2],
    explanation: `Explanation for ${id}`,
  };
}

function multiSelectProblem(id, correctIndices = [0, 2]) {
  return {
    id,
    type: "multi-select",
    question: `Multi ${id}`,
    options: ["A", "B", "C", "D"],
    correctIndices,
    explanation: `Explanation for ${id}`,
  };
}

function twoStageProblem(id) {
  return {
    id,
    type: "two-stage",
    stages: [
      {
        question: "Part 1",
        options: ["X", "Y"],
        correct: 0,
        explanation: "Stage 1 exp",
      },
      {
        question: "Part 2",
        options: ["P", "Q"],
        correct: 1,
        explanation: "Stage 2 exp",
      },
    ],
  };
}

/** Collect all emissions of a given event. */
function collectEvents(quiz, event) {
  const events = [];
  quiz.on(event, (payload) => events.push(payload));
  return events;
}

// =============================================
// State machine & lifecycle
// =============================================

describe("state machine", () => {
  let quiz;
  beforeEach(() => {
    quiz = new OpenQuizzer();
  });

  it("starts in idle", () => {
    assert.equal(quiz.state, "idle");
  });

  it("transitions idle → practicing on start", () => {
    quiz.loadProblems([mcProblem("m1")]);
    const changes = collectEvents(quiz, "stateChange");
    quiz.start();
    assert.equal(quiz.state, "practicing");
    assert.deepEqual(changes[changes.length - 1], {
      from: "idle",
      to: "practicing",
    });
  });

  it("transitions practicing → answered on answer", () => {
    quiz.loadProblems([mcProblem("m1", 2)]);
    quiz.start();
    quiz.selectOption(2);
    assert.equal(quiz.state, "answered");
  });

  it("transitions answered → complete on next when last question", () => {
    quiz.loadProblems([mcProblem("m1", 0)]);
    quiz.start();
    quiz.selectOption(0);
    const changes = collectEvents(quiz, "stateChange");
    quiz.next();
    assert.equal(quiz.state, "complete");
    assert.deepEqual(changes[changes.length - 1], {
      from: "answered",
      to: "complete",
    });
  });

  it("transitions answered → practicing on next when more questions", () => {
    quiz.loadProblems([mcProblem("m1", 0), mcProblem("m2", 1)]);
    quiz.start();
    quiz.selectOption(0);
    quiz.next();
    assert.equal(quiz.state, "practicing");
  });

  it("start with no problems is a no-op", () => {
    quiz.loadProblems([]);
    quiz.start();
    assert.equal(quiz.state, "idle");
  });

  it("reset returns to idle", () => {
    quiz.loadProblems([mcProblem("m1")]);
    quiz.start();
    quiz.reset();
    assert.equal(quiz.state, "idle");
    assert.equal(quiz.problem, null);
  });

  it("retry reshuffles and restarts from practicing", () => {
    quiz.loadProblems([mcProblem("m1", 0), mcProblem("m2", 1)]);
    quiz.start();
    quiz.selectOption(0);
    quiz.next();
    quiz.selectOption(1);
    quiz.retry();
    assert.equal(quiz.state, "practicing");
    assert.deepEqual(quiz.progress, { current: 1, total: 2 });
    assert.deepEqual(quiz.score, {
      correct: 0,
      total: 0,
      percentage: 0,
      skipped: 0,
    });
  });
});

// =============================================
// State guards — actions rejected in wrong state
// =============================================

describe("state guards", () => {
  let quiz;
  beforeEach(() => {
    quiz = new OpenQuizzer();
  });

  it("selectOption does nothing in idle", () => {
    quiz.loadProblems([mcProblem("m1")]);
    const events = collectEvents(quiz, "optionSelected");
    quiz.selectOption(0);
    assert.equal(events.length, 0);
    assert.equal(quiz.state, "idle");
  });

  it("next does nothing in practicing", () => {
    quiz.loadProblems([mcProblem("m1"), mcProblem("m2")]);
    quiz.start();
    quiz.next();
    assert.equal(quiz.state, "practicing");
    assert.deepEqual(quiz.progress, { current: 1, total: 2 });
  });

  it("double answer is ignored for multiple choice", () => {
    quiz.loadProblems([mcProblem("m1", 1)]);
    quiz.start();
    quiz.selectOption(0); // wrong
    quiz.selectOption(1); // this should be ignored — already answered
    assert.equal(quiz.answers.length, 1);
    assert.equal(quiz.answers[0].selected, 0);
  });

  it("submitNumeric ignores empty string", () => {
    quiz.loadProblems([numericProblem("n1")]);
    quiz.start();
    quiz.submitNumeric("");
    assert.equal(quiz.state, "practicing");
    quiz.submitNumeric("   ");
    assert.equal(quiz.state, "practicing");
  });
});

// =============================================
// Multiple choice
// =============================================

describe("multiple choice", () => {
  it("correct answer", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([mcProblem("m1", 2)]);
    quiz.start();
    const events = collectEvents(quiz, "optionSelected");
    quiz.selectOption(2);
    assert.equal(events[0].correct, true);
    assert.equal(events[0].correctIndex, 2);
    assert.equal(quiz.score.correct, 1);
  });

  it("incorrect answer", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([mcProblem("m1", 2)]);
    quiz.start();
    const events = collectEvents(quiz, "optionSelected");
    quiz.selectOption(0);
    assert.equal(events[0].correct, false);
    assert.equal(events[0].correctIndex, 2);
    assert.equal(quiz.score.correct, 0);
  });
});

// =============================================
// Numeric input
// =============================================

describe("numeric input", () => {
  it("correct within tolerance", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([numericProblem("n1", { answer: 1000, tolerance: 0.1 })]);
    quiz.start();
    const events = collectEvents(quiz, "numericResult");
    quiz.submitNumeric("950");
    assert.equal(events[0].correct, true);
  });

  it("incorrect outside tolerance", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([numericProblem("n1", { answer: 1000, tolerance: 0.1 })]);
    quiz.start();
    const events = collectEvents(quiz, "numericResult");
    quiz.submitNumeric("500");
    assert.equal(events[0].correct, false);
    assert.equal(events[0].formatted, "1K");
  });

  it("parses K suffix", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([
      numericProblem("n1", { answer: 5000, tolerance: 0.01 }),
    ]);
    quiz.start();
    const events = collectEvents(quiz, "numericResult");
    quiz.submitNumeric("5K");
    assert.equal(events[0].correct, true);
    assert.equal(events[0].userValue, 5000);
  });

  it("parses M suffix", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([
      numericProblem("n1", { answer: 2000000, tolerance: 0.01 }),
    ]);
    quiz.start();
    const events = collectEvents(quiz, "numericResult");
    quiz.submitNumeric("2M");
    assert.equal(events[0].correct, true);
  });

  it("parses commas", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([
      numericProblem("n1", { answer: 1000000, tolerance: 0.01 }),
    ]);
    quiz.start();
    const events = collectEvents(quiz, "numericResult");
    quiz.submitNumeric("1,000,000");
    assert.equal(events[0].correct, true);
  });

  it("exact tolerance", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([
      numericProblem("n1", { answer: 42, tolerance: "exact" }),
    ]);
    quiz.start();
    const events = collectEvents(quiz, "numericResult");
    quiz.submitNumeric("42");
    assert.equal(events[0].correct, true);
  });

  it("order-of-magnitude tolerance", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([
      numericProblem("n1", { answer: 1000, tolerance: "order-of-magnitude" }),
    ]);
    quiz.start();
    const events = collectEvents(quiz, "numericResult");
    quiz.submitNumeric("5000");
    assert.equal(events[0].correct, true);
  });

  it("default 50% tolerance when unspecified", () => {
    const quiz = new OpenQuizzer();
    const p = numericProblem("n1", { answer: 1000 });
    delete p.tolerance;
    quiz.loadProblems([p]);
    quiz.start();
    const events = collectEvents(quiz, "numericResult");
    quiz.submitNumeric("1400");
    assert.equal(events[0].correct, true);
  });

  it("NaN input is incorrect", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([
      numericProblem("n1", { answer: 100, tolerance: "exact" }),
    ]);
    quiz.start();
    const events = collectEvents(quiz, "numericResult");
    quiz.submitNumeric("abc");
    assert.equal(events[0].correct, false);
  });

  it("correctValue of 0 does not divide by zero", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([numericProblem("n1", { answer: 0, tolerance: 0.1 })]);
    quiz.start();
    const events = collectEvents(quiz, "numericResult");
    quiz.submitNumeric("0");
    assert.equal(events[0].correct, true);
  });

  it("correctValue of 0 rejects nonzero", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([numericProblem("n1", { answer: 0, tolerance: 0.1 })]);
    quiz.start();
    const events = collectEvents(quiz, "numericResult");
    quiz.submitNumeric("5");
    assert.equal(events[0].correct, false);
  });
});

// =============================================
// Ordering
// =============================================

describe("ordering", () => {
  it("correct order submitted", () => {
    const quiz = new OpenQuizzer();
    const problem = orderingProblem("o1");
    // Mock shuffle to ensure known initial state (reverse correct order)
    quiz.loadProblems([problem]);

    // We need to know the initial shuffled order to manipulate it
    // But since we can't easily mock the internal shuffle without dependency injection,
    // we'll listen for the initial emission
    const showEvents = collectEvents(quiz, "questionShow");
    quiz.start();

    const initialItems = showEvents[0].shuffledItems;

    // Track visual order locally to selection-sort into correct order
    let currentOrder = initialItems.map((i) => i.originalIndex);

    // Sort logic: Selection sort
    for (let i = 0; i < problem.correctOrder.length; i++) {
      const targetOriginalIndex = problem.correctOrder[i];
      const currentPos = currentOrder.indexOf(targetOriginalIndex);

      if (currentPos !== i) {
        quiz.moveOrderingItem(currentPos, i);

        // update our local validation shadow
        const item = currentOrder[currentPos];
        currentOrder.splice(currentPos, 1);
        currentOrder.splice(i, 0, item);
      }
    }

    const results = collectEvents(quiz, "orderingResult");
    quiz.submitOrdering();

    assert.equal(results.length, 1);
    assert.equal(results[0].correct, true);
    assert.deepEqual(results[0].userOrder, [0, 1, 2]);
    assert.equal(quiz.state, "answered");
  });

  it("incorrect order submitted", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([orderingProblem("o1")]);
    quiz.start();
    const results = collectEvents(quiz, "orderingResult");

    // Just submit immediately (stats are shuffled, likely wrong)
    // There is a 1/6 chance it's correct by accident, but let's assume it's wrong for the test
    // or force a wrong move.

    // To be safe, let's force a wrong order. Correct is [0, 1, 2].
    // We'll trigger a move to ensure we have a state, then fail.
    // Actually, simply submitting the shuffled order is almost certainly wrong,
    // but better to be deterministic.

    // Let's force it to be [2, 1, 0]
    // 1. Find 2, move to 0
    // 2. Find 1, move to 1
    // 3. 0 should be at 2

    const showEvents = collectEvents(quiz, "questionShow");
    // restart to capture event
    quiz.retry();
    const initialItems = showEvents[0].shuffledItems;
    let currentOrder = initialItems.map((i) => i.originalIndex);

    const targetOrder = [2, 1, 0];

    for (let i = 0; i < targetOrder.length; i++) {
      const target = targetOrder[i];
      const currentPos = currentOrder.indexOf(target);
      if (currentPos !== i) {
        quiz.moveOrderingItem(currentPos, i);
        const item = currentOrder[currentPos];
        currentOrder.splice(currentPos, 1);
        currentOrder.splice(i, 0, item);
      }
    }

    quiz.submitOrdering();
    assert.equal(results[0].correct, false);
    assert.deepEqual(results[0].userOrder, [2, 1, 0]);
  });

  it("moveOrderingItem updates order", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([orderingProblem("o1")]);
    quiz.start();

    // Capture initial order
    const updates = collectEvents(quiz, "orderingUpdate");

    // Move index 0 to index 1
    quiz.moveOrderingItem(0, 1);

    assert.equal(updates.length, 1);
    assert.ok(updates[0].order.length === 3);
  });

  it("moveOrderingItem with invalid bounds is ignored", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([orderingProblem("o1")]);
    quiz.start();
    const updates = collectEvents(quiz, "orderingUpdate");

    quiz.moveOrderingItem(-1, 0);
    quiz.moveOrderingItem(0, 100);

    assert.equal(updates.length, 0);
  });
});

// =============================================
// Multi-select
// =============================================

describe("multi-select", () => {
  it("correct selection", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([multiSelectProblem("ms1", [0, 2])]);
    quiz.start();
    const results = collectEvents(quiz, "multiSelectResult");

    quiz.toggleMultiSelect(0);
    quiz.toggleMultiSelect(2);
    quiz.submitMultiSelect();

    assert.equal(results[0].correct, true);
  });

  it("incorrect — missing one", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([multiSelectProblem("ms1", [0, 2])]);
    quiz.start();
    const results = collectEvents(quiz, "multiSelectResult");

    quiz.toggleMultiSelect(0);
    quiz.submitMultiSelect();

    assert.equal(results[0].correct, false);
  });

  it("incorrect — extra selection", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([multiSelectProblem("ms1", [0, 2])]);
    quiz.start();
    const results = collectEvents(quiz, "multiSelectResult");

    quiz.toggleMultiSelect(0);
    quiz.toggleMultiSelect(1);
    quiz.toggleMultiSelect(2);
    quiz.submitMultiSelect();

    assert.equal(results[0].correct, false);
  });

  it("toggle off deselects", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([multiSelectProblem("ms1", [0, 2])]);
    quiz.start();
    const toggles = collectEvents(quiz, "multiSelectToggle");

    quiz.toggleMultiSelect(1);
    quiz.toggleMultiSelect(1);

    assert.equal(toggles[0].selected, true);
    assert.equal(toggles[1].selected, false);
  });
});

// =============================================
// Two-stage
// =============================================

describe("two-stage", () => {
  it("both stages correct", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([twoStageProblem("ts1")]);
    quiz.start();
    const advances = collectEvents(quiz, "twoStageAdvance");
    const selected = collectEvents(quiz, "optionSelected");

    quiz.selectOption(0); // stage 1 correct
    assert.equal(advances.length, 1);
    assert.equal(advances[0].stageResult.correct, true);
    assert.equal(quiz.state, "practicing"); // still practicing between stages

    quiz.selectOption(1); // stage 2 correct
    assert.equal(selected.length, 1);
    assert.equal(selected[0].isFinalStage, true);
    assert.equal(selected[0].allCorrect, true);
    assert.equal(quiz.state, "answered");
    assert.equal(quiz.score.correct, 1);
  });

  it("first stage wrong, second right — overall incorrect", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([twoStageProblem("ts1")]);
    quiz.start();
    const selected = collectEvents(quiz, "optionSelected");

    quiz.selectOption(1); // stage 1 wrong (correct is 0)
    quiz.selectOption(1); // stage 2 correct

    assert.equal(selected[0].allCorrect, false);
    assert.equal(quiz.score.correct, 0);
  });

  it("advance payload includes previous answer text", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([twoStageProblem("ts1")]);
    quiz.start();
    const advances = collectEvents(quiz, "twoStageAdvance");

    quiz.selectOption(0);

    assert.equal(advances[0].nextStage.previousAnswer, "X");
  });
});

// =============================================
// detailedExplanation
// =============================================

describe("detailedExplanation", () => {
  it("included in optionSelected event when present", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([
      mcProblem("m1", 0, { detailedExplanation: "<p>Details here</p>" }),
    ]);
    quiz.start();
    const events = collectEvents(quiz, "optionSelected");
    quiz.selectOption(0);
    assert.equal(events[0].detailedExplanation, "<p>Details here</p>");
  });

  it("undefined in optionSelected event when absent", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([mcProblem("m1", 0)]);
    quiz.start();
    const events = collectEvents(quiz, "optionSelected");
    quiz.selectOption(0);
    assert.equal(events[0].detailedExplanation, undefined);
  });

  it("included in numericResult event when present", () => {
    const quiz = new OpenQuizzer();
    const problem = numericProblem("n1", { answer: 100, tolerance: "exact" });
    problem.detailedExplanation = "<p>Numeric details</p>";
    quiz.loadProblems([problem]);
    quiz.start();
    const events = collectEvents(quiz, "numericResult");
    quiz.submitNumeric("100");
    assert.equal(events[0].detailedExplanation, "<p>Numeric details</p>");
  });

  it("included in multiSelectResult event when present", () => {
    const quiz = new OpenQuizzer();
    const problem = multiSelectProblem("ms1", [0, 2]);
    problem.detailedExplanation = "<p>Multi details</p>";
    quiz.loadProblems([problem]);
    quiz.start();
    const events = collectEvents(quiz, "multiSelectResult");
    quiz.toggleMultiSelect(0);
    quiz.toggleMultiSelect(2);
    quiz.submitMultiSelect();
    assert.equal(events[0].detailedExplanation, "<p>Multi details</p>");
  });

  it("included in orderingResult event when present", () => {
    const quiz = new OpenQuizzer();
    const problem = orderingProblem("o1");
    problem.detailedExplanation = "<p>Ordering details</p>";
    quiz.loadProblems([problem]);
    quiz.start();
    const events = collectEvents(quiz, "orderingResult");
    quiz.submitOrdering();
    assert.equal(events[0].detailedExplanation, "<p>Ordering details</p>");
  });

  it("included in two-stage final optionSelected via stage", () => {
    const quiz = new OpenQuizzer();
    const problem = twoStageProblem("ts1");
    problem.stages[1].detailedExplanation = "<p>Stage 2 details</p>";
    quiz.loadProblems([problem]);
    quiz.start();
    const events = collectEvents(quiz, "optionSelected");
    quiz.selectOption(0); // stage 1
    quiz.selectOption(1); // stage 2 (final)
    assert.equal(events[0].detailedExplanation, "<p>Stage 2 details</p>");
  });
});

// =============================================
// references
// =============================================

describe("references", () => {
  const sampleRefs = [
    { title: "Wikipedia", url: "https://en.wikipedia.org/wiki/Test" },
    { title: "Khan Academy", url: "https://www.khanacademy.org/test" },
  ];

  it("included in optionSelected event when present", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([mcProblem("m1", 0, { references: sampleRefs })]);
    quiz.start();
    const events = collectEvents(quiz, "optionSelected");
    quiz.selectOption(0);
    assert.deepEqual(events[0].references, sampleRefs);
  });

  it("undefined in optionSelected event when absent", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([mcProblem("m1", 0)]);
    quiz.start();
    const events = collectEvents(quiz, "optionSelected");
    quiz.selectOption(0);
    assert.equal(events[0].references, undefined);
  });

  it("included in numericResult event when present", () => {
    const quiz = new OpenQuizzer();
    const problem = numericProblem("n1", { answer: 100, tolerance: "exact" });
    problem.references = sampleRefs;
    quiz.loadProblems([problem]);
    quiz.start();
    const events = collectEvents(quiz, "numericResult");
    quiz.submitNumeric("100");
    assert.deepEqual(events[0].references, sampleRefs);
  });

  it("included in multiSelectResult event when present", () => {
    const quiz = new OpenQuizzer();
    const problem = multiSelectProblem("ms1", [0, 2]);
    problem.references = sampleRefs;
    quiz.loadProblems([problem]);
    quiz.start();
    const events = collectEvents(quiz, "multiSelectResult");
    quiz.toggleMultiSelect(0);
    quiz.toggleMultiSelect(2);
    quiz.submitMultiSelect();
    assert.deepEqual(events[0].references, sampleRefs);
  });

  it("included in orderingResult event when present", () => {
    const quiz = new OpenQuizzer();
    const problem = orderingProblem("o1");
    problem.references = sampleRefs;
    quiz.loadProblems([problem]);
    quiz.start();
    const events = collectEvents(quiz, "orderingResult");
    quiz.submitOrdering();
    assert.deepEqual(events[0].references, sampleRefs);
  });

  it("included in two-stage final optionSelected via stage", () => {
    const quiz = new OpenQuizzer();
    const problem = twoStageProblem("ts1");
    problem.stages[1].references = sampleRefs;
    quiz.loadProblems([problem]);
    quiz.start();
    const events = collectEvents(quiz, "optionSelected");
    quiz.selectOption(0); // stage 1
    quiz.selectOption(1); // stage 2 (final)
    assert.deepEqual(events[0].references, sampleRefs);
  });
});

// =============================================
// Full session flow
// =============================================

describe("full session flow", () => {
  it("3 questions → score → retry → score", () => {
    const quiz = new OpenQuizzer();
    const problems = [
      mcProblem("m1", 0),
      mcProblem("m2", 1),
      mcProblem("m3", 2),
    ];
    quiz.loadProblems(problems);
    quiz.start();

    const completeEvents = collectEvents(quiz, "complete");

    // Answer all 3 (get 2 right, 1 wrong)
    // Due to shuffling we don't know order, so answer the correct index from the problem
    for (let i = 0; i < 3; i++) {
      const p = quiz.problem;
      if (i < 2) {
        quiz.selectOption(p.correct); // correct
      } else {
        quiz.selectOption((p.correct + 1) % 4); // wrong
      }
      quiz.next();
    }

    assert.equal(quiz.state, "complete");
    assert.equal(completeEvents.length, 1);
    assert.equal(completeEvents[0].correct, 2);
    assert.equal(completeEvents[0].total, 3);
    assert.equal(completeEvents[0].percentage, 67);
    assert.equal(typeof completeEvents[0].sessionSummary, "object");
    assert.equal(completeEvents[0].sessionSummary.score.correct, 2);
    assert.equal(completeEvents[0].sessionSummary.score.total, 3);

    // Retry
    quiz.retry();
    assert.equal(quiz.state, "practicing");
    assert.equal(quiz.score.total, 0);
  });

  it("mixed question types in one session", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([
      mcProblem("m1", 0),
      numericProblem("n1", { answer: 100, tolerance: "exact" }),
      orderingProblem("o1"),
      multiSelectProblem("ms1", [1, 3]),
    ]);
    let currentShuffledItems = [];
    quiz.on("questionShow", ({ shuffledItems }) => {
      if (shuffledItems) currentShuffledItems = shuffledItems;
    });

    quiz.start();

    // Answer each question correctly regardless of shuffle order
    for (let i = 0; i < 4; i++) {
      const p = quiz.problem;
      const type = p.type || "multiple-choice";

      if (type === "multiple-choice") {
        quiz.selectOption(p.correct);
      } else if (type === "numeric-input") {
        quiz.submitNumeric(String(p.answer));
      } else if (type === "ordering") {
        // Sort to match correctOrder
        let currentOrder = currentShuffledItems.map(
          (item) => item.originalIndex,
        );

        for (let k = 0; k < p.correctOrder.length; k++) {
          const targetOriginalIndex = p.correctOrder[k];
          const currentPos = currentOrder.indexOf(targetOriginalIndex);

          if (currentPos !== k) {
            quiz.moveOrderingItem(currentPos, k);
            const item = currentOrder[currentPos];
            currentOrder.splice(currentPos, 1);
            currentOrder.splice(k, 0, item);
          }
        }
        quiz.submitOrdering();
      } else if (type === "multi-select") {
        p.correctIndices.forEach((idx) => quiz.toggleMultiSelect(idx));
        quiz.submitMultiSelect();
      }

      quiz.next();
    }

    assert.equal(quiz.state, "complete");
    assert.equal(quiz.score.correct, 4);
    assert.equal(quiz.score.percentage, 100);
  });
});

// =============================================
// Event system
// =============================================

describe("event system", () => {
  it("on returns this for chaining", () => {
    const quiz = new OpenQuizzer();
    const result = quiz.on("stateChange", () => {});
    assert.equal(result, quiz);
  });

  it("off removes listener", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([mcProblem("m1", 0)]);
    const calls = [];
    const fn = (p) => calls.push(p);
    quiz.on("stateChange", fn);
    quiz.start();
    assert.equal(calls.length, 1);

    quiz.off("stateChange", fn);
    quiz.selectOption(0); // would emit stateChange → answered
    assert.equal(calls.length, 1); // listener removed, no new call
  });

  it("questionShow fires on start", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([mcProblem("m1")]);
    const events = collectEvents(quiz, "questionShow");
    quiz.start();
    assert.equal(events.length, 1);
    assert.equal(events[0].index, 0);
    assert.equal(events[0].total, 1);
  });

  it("questionShow includes shuffledItems for ordering", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([orderingProblem("o1")]);
    const events = collectEvents(quiz, "questionShow");
    quiz.start();
    assert.ok(Array.isArray(events[0].shuffledItems));
    assert.equal(events[0].shuffledItems.length, 3);
    // Each item has originalIndex and text
    events[0].shuffledItems.forEach((item) => {
      assert.ok("originalIndex" in item);
      assert.ok("text" in item);
    });
  });
});

// =============================================
// Progress & score getters
// =============================================

describe("getters", () => {
  it("progress tracks position", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([mcProblem("m1", 0), mcProblem("m2", 0)]);
    quiz.start();
    assert.deepEqual(quiz.progress, { current: 1, total: 2 });
    quiz.selectOption(0);
    quiz.next();
    assert.deepEqual(quiz.progress, { current: 2, total: 2 });
  });

  it("score percentage rounds correctly", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([
      mcProblem("m1", 0),
      mcProblem("m2", 0),
      mcProblem("m3", 0),
    ]);
    quiz.start();

    quiz.selectOption(0);
    quiz.next(); // correct
    quiz.selectOption(1);
    quiz.next(); // wrong (correct is 0)
    // 1 of 2 = 50%
    assert.equal(quiz.score.percentage, 50);
  });

  it("problem returns null in idle and complete", () => {
    const quiz = new OpenQuizzer();
    assert.equal(quiz.problem, null);
    quiz.loadProblems([mcProblem("m1", 0)]);
    assert.equal(quiz.problem, null);
    quiz.start();
    assert.notEqual(quiz.problem, null);
    quiz.selectOption(0);
    quiz.next();
    assert.equal(quiz.state, "complete");
    assert.equal(quiz.problem, null);
  });

  it("answers returns a copy", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([mcProblem("m1", 0)]);
    quiz.start();
    quiz.selectOption(0);
    const a1 = quiz.answers;
    const a2 = quiz.answers;
    assert.notEqual(a1, a2); // different array references
    assert.deepEqual(a1, a2); // same content
  });

  it("loadProblems copies the array — caller mutation does not affect retry", () => {
    const quiz = new OpenQuizzer();
    const problems = [mcProblem("m1", 0), mcProblem("m2", 1)];
    quiz.loadProblems(problems);
    problems.length = 0; // caller mutates
    quiz.start();
    assert.equal(quiz.progress.total, 2); // engine still has 2
    quiz.selectOption(quiz.problem.correct);
    quiz.next();
    quiz.selectOption(quiz.problem.correct);
    quiz.next(); // complete
    quiz.retry();
    assert.equal(quiz.progress.total, 2); // retry still has 2
  });

  it("getSessionSummary returns score and type-aware answer details", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([
      mcProblem("m1", 2),
      numericProblem("n1", { answer: 100, tolerance: "exact" }),
      orderingProblem("o1"),
      multiSelectProblem("ms1", [1, 3]),
      twoStageProblem("ts1"),
    ]);

    let currentOrderingItems = [];
    quiz.on("questionShow", ({ shuffledItems }) => {
      if (shuffledItems) currentOrderingItems = shuffledItems;
    });

    quiz.start();
    while (quiz.state !== "complete") {
      const problem = quiz.problem;
      const type = problem.type || "multiple-choice";

      if (type === "multiple-choice") {
        quiz.selectOption(problem.correct);
      } else if (type === "numeric-input") {
        quiz.submitNumeric(String(problem.answer));
      } else if (type === "ordering") {
        let currentOrder = currentOrderingItems.map(
          (item) => item.originalIndex,
        );
        for (let i = 0; i < problem.correctOrder.length; i++) {
          const targetOriginalIndex = problem.correctOrder[i];
          const currentPos = currentOrder.indexOf(targetOriginalIndex);
          if (currentPos !== i) {
            quiz.moveOrderingItem(currentPos, i);
            const item = currentOrder[currentPos];
            currentOrder.splice(currentPos, 1);
            currentOrder.splice(i, 0, item);
          }
        }
        quiz.submitOrdering();
      } else if (type === "multi-select") {
        problem.correctIndices.forEach((index) =>
          quiz.toggleMultiSelect(index),
        );
        quiz.submitMultiSelect();
      } else if (type === "two-stage") {
        problem.stages.forEach((stage) => quiz.selectOption(stage.correct));
      }

      quiz.next();
    }

    const summary = quiz.getSessionSummary();

    assert.equal(typeof summary.timestamp, "string");
    assert.ok(!Number.isNaN(Date.parse(summary.timestamp)));
    assert.deepEqual(summary.score, {
      correct: 5,
      total: 5,
      percentage: 100,
      skipped: 0,
    });
    assert.equal(summary.results.length, 5);

    const byType = new Map(
      summary.results.map((result) => [result.type, result]),
    );
    assert.deepEqual(byType.get("multiple-choice").correctAnswer, 2);
    assert.equal(byType.get("numeric-input").correctAnswer, 100);
    assert.deepEqual(byType.get("ordering").correctAnswer, [0, 1, 2]);
    assert.deepEqual(byType.get("multi-select").correctAnswer, [1, 3]);
    assert.deepEqual(byType.get("two-stage").correctAnswer, [0, 1]);
    assert.equal(Array.isArray(byType.get("two-stage").userAnswer), true);
  });

  it("getSessionSummary supports partial sessions before completion", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([mcProblem("m1", 0), mcProblem("m2", 1)]);
    quiz.start();

    const firstProblem = quiz.problem;
    quiz.selectOption(firstProblem.correct); // one answered, session still incomplete

    const summary = quiz.getSessionSummary();
    assert.equal(quiz.state, "answered");
    assert.deepEqual(summary.score, {
      correct: 1,
      total: 1,
      percentage: 100,
      skipped: 0,
    });
    assert.equal(summary.results.length, 1);
    assert.equal(summary.results[0].id, firstProblem.id);
    assert.equal(summary.results[0].type, "multiple-choice");
  });

  it("getSessionSummary returns empty results when started but unanswered", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([mcProblem("m1", 0), mcProblem("m2", 1)]);
    quiz.start();

    const summary = quiz.getSessionSummary();
    assert.deepEqual(summary.score, {
      correct: 0,
      total: 0,
      percentage: 0,
      skipped: 0,
    });
    assert.deepEqual(summary.results, []);
  });

  it("getSessionSummary returns empty score/results in idle", () => {
    const quiz = new OpenQuizzer();
    const summary = quiz.getSessionSummary();
    assert.deepEqual(summary.score, {
      correct: 0,
      total: 0,
      percentage: 0,
      skipped: 0,
    });
    assert.deepEqual(summary.results, []);
    assert.ok(!Number.isNaN(Date.parse(summary.timestamp)));
  });

  it("getSessionSummary returns defensive copies", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([multiSelectProblem("ms1", [0, 2])]);
    quiz.start();
    quiz.toggleMultiSelect(0);
    quiz.toggleMultiSelect(2);
    quiz.submitMultiSelect();

    const summary1 = quiz.getSessionSummary();
    summary1.results[0].userAnswer.push(99);
    summary1.results[0].correctAnswer.push(88);

    const summary2 = quiz.getSessionSummary();
    assert.deepEqual(summary2.results[0].userAnswer, [0, 2]);
    assert.deepEqual(summary2.results[0].correctAnswer, [0, 2]);
  });
});

// =============================================
// Session length cap
// =============================================

describe("session length cap", () => {
  it("loadProblems respects maxProblems", () => {
    const quiz = new OpenQuizzer();
    const problems = Array.from({ length: 10 }, (_, i) => mcProblem(`m${i}`));
    quiz.loadProblems(problems, 3);
    quiz.start();
    assert.equal(quiz.progress.total, 3);
    assert.equal(quiz.score.total, 0);
  });

  it("retry respects maxProblems", () => {
    const quiz = new OpenQuizzer();
    const problems = Array.from({ length: 10 }, (_, i) => mcProblem(`m${i}`));
    quiz.loadProblems(problems, 3);
    quiz.start();

    // Complete the first session
    for (let i = 0; i < 3; i++) {
      quiz.selectOption(0);
      quiz.next();
    }
    assert.equal(quiz.state, "complete");

    // Retry
    quiz.retry();
    assert.equal(quiz.state, "practicing");
    assert.equal(quiz.progress.total, 3);
  });

  it("maxProblems > available problems loads all", () => {
    const quiz = new OpenQuizzer();
    const problems = [mcProblem("m1"), mcProblem("m2")];
    quiz.loadProblems(problems, 5);
    quiz.start();
    assert.equal(quiz.progress.total, 2);
  });

  it("maxProblems = 0 means unlimited", () => {
    const quiz = new OpenQuizzer();
    const problems = Array.from({ length: 10 }, (_, i) => mcProblem(`m${i}`));
    quiz.loadProblems(problems, 0);
    quiz.start();
    assert.equal(quiz.progress.total, 10);
  });
});

// =============================================
// Weighting system
// =============================================

describe("weighting system", () => {
  function getProblemTypes(quiz) {
    const types = [];
    // Track latest shuffledItems for ordering questions
    let lastShuffledItems = null;
    quiz.on("questionShow", (e) => {
      lastShuffledItems = e.shuffledItems;
    });

    quiz.start();
    while (quiz.state === "practicing") {
      types.push(quiz.problem.type);
      if (quiz.progress.current < quiz.progress.total) {
        const p = quiz.problem;
        if (p.type === "multiple-choice") {
          quiz.selectOption(p.correct);
        } else if (p.type === "numeric-input") {
          quiz.submitNumeric(String(p.answer));
        } else if (p.type === "ordering") {
          // Selection-sort into correct order via moveOrderingItem, then submit
          const order = lastShuffledItems.map((i) => i.originalIndex);
          for (let j = 0; j < p.correctOrder.length; j++) {
            const from = order.indexOf(p.correctOrder[j]);
            if (from !== j) {
              quiz.moveOrderingItem(from, j);
              const item = order[from];
              order.splice(from, 1);
              order.splice(j, 0, item);
            }
          }
          quiz.submitOrdering();
        } else if (p.type === "multi-select") {
          p.correctIndices.forEach((i) => quiz.toggleMultiSelect(i));
          quiz.submitMultiSelect();
        } else if (p.type === "two-stage") {
          for (let s = 0; s < p.stages.length; s++) {
            quiz.selectOption(p.stages[s].correct);
          }
        }
        quiz.next();
      } else {
        break;
      }
    }
    return types;
  }

  // Simpler approach: check distribution of first question over many runs
  it("high weight type appears first more often", () => {
    const typeWeights = { "multiple-choice": 1, "numeric-input": 100 };
    const problems = [mcProblem("m1"), numericProblem("n1")];

    let numericFirst = 0;
    const iterations = 50;

    for (let i = 0; i < iterations; i++) {
      const quiz = new OpenQuizzer({ typeWeights });
      quiz.loadProblems(problems);
      quiz.start();
      if (quiz.problem.type === "numeric-input") {
        numericFirst++;
      }
    }

    // With 100:1 ratio, numeric should be first nearly always (>= 90%)
    // But statistically could fail rare, so we'll be lenient but expect majority
    assert.ok(
      numericFirst > 40,
      `Numeric should be first most times (got ${numericFirst}/${iterations})`,
    );
  });

  it("0 weight suppresses type", () => {
    const typeWeights = { "multiple-choice": 1, "numeric-input": 0 };
    const problems = [mcProblem("m1"), mcProblem("m2"), numericProblem("n1")];

    // Test multiple times to ensure it never appears
    for (let i = 0; i < 10; i++) {
      const quiz = new OpenQuizzer({ typeWeights });
      quiz.loadProblems(problems);
      quiz.start();

      while (quiz.state === "practicing") {
        assert.notEqual(quiz.problem.type, "numeric-input");
        if (quiz.problem.type === "multiple-choice") quiz.selectOption(0); // arbitrary answer
        if (quiz.progress.current === quiz.progress.total) break;
        quiz.next();
      }
    }
  });

  it("defaults to 1 if weight unspecified", () => {
    const typeWeights = { "multiple-choice": 100 };
    // numeric-input undefined => default 1

    // Ratio 100:1. MC should dominate.
    const problems = [mcProblem("m1"), numericProblem("n1")];
    let mcFirst = 0;
    const iterations = 50;

    for (let i = 0; i < iterations; i++) {
      const quiz = new OpenQuizzer({ typeWeights });
      quiz.loadProblems(problems);
      quiz.start();
      if (quiz.problem.type === "multiple-choice") mcFirst++;
    }

    assert.ok(
      mcFirst > 40,
      `MC should be first most times (got ${mcFirst}/${iterations})`,
    );
  });
});

// =============================================
// Skip
// =============================================

describe("skip", () => {
  it("advances to next question", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([mcProblem("m1"), mcProblem("m2")]);
    quiz.start();
    const questions = collectEvents(quiz, "questionShow");
    quiz.skip();
    assert.equal(quiz.state, "practicing");
    assert.equal(questions.length, 1);
    assert.equal(questions[0].index, 1);
  });

  it("on last question completes session", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([mcProblem("m1")]);
    quiz.start();
    const completes = collectEvents(quiz, "complete");
    quiz.skip();
    assert.equal(quiz.state, "complete");
    assert.equal(completes.length, 1);
  });

  it("ignored outside practicing state", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([mcProblem("m1")]);
    const skipEvents = collectEvents(quiz, "skip");
    quiz.skip(); // idle — should be ignored
    assert.equal(skipEvents.length, 0);
    assert.equal(quiz.state, "idle");

    quiz.start();
    quiz.selectOption(0); // now in answered state
    quiz.skip(); // answered — should be ignored
    assert.equal(skipEvents.length, 0);
    assert.equal(quiz.state, "answered");
  });

  it("skipped problems excluded from score", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([
      mcProblem("m1", 0),
      mcProblem("m2", 0),
      mcProblem("m3", 0),
    ]);
    quiz.start();

    // Skip first, answer second correctly, skip third
    quiz.skip();
    quiz.selectOption(quiz.problem.correct);
    quiz.next();
    quiz.skip();

    const score = quiz.score;
    assert.equal(score.correct, 1);
    assert.equal(score.total, 1);
    assert.equal(score.percentage, 100);
    assert.equal(score.skipped, 2);
  });

  it("emits skip event with correct payload", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([mcProblem("m1"), mcProblem("m2")]);
    quiz.start();
    const skipEvents = collectEvents(quiz, "skip");
    const firstProblem = quiz.problem;
    quiz.skip();
    assert.equal(skipEvents.length, 1);
    assert.equal(skipEvents[0].problemId, firstProblem.id);
    assert.equal(skipEvents[0].index, 0);
    assert.equal(skipEvents[0].total, 2);
  });
});

// =============================================
// Tags
// =============================================

describe("tags", () => {
  it("tags passed through in session summary results", () => {
    const quiz = new OpenQuizzer();
    const problem = mcProblem("m1", 0);
    problem.tags = ["geography", "capitals"];
    quiz.loadProblems([problem]);
    quiz.start();
    quiz.selectOption(0);
    const summary = quiz.getSessionSummary();
    assert.deepEqual(summary.results[0].tags, ["geography", "capitals"]);
  });

  it("missing tags default to empty array", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([mcProblem("m1", 0)]);
    quiz.start();
    quiz.selectOption(0);
    const summary = quiz.getSessionSummary();
    assert.deepEqual(summary.results[0].tags, []);
  });
});

// =============================================
// Context
// =============================================

describe("context", () => {
  it("context included in session summary", () => {
    const quiz = new OpenQuizzer();
    const ctx = { chapterTitle: "Ch1", unitId: 1 };
    quiz.loadProblems([mcProblem("m1", 0)], 0, ctx);
    quiz.start();
    quiz.selectOption(0);
    const summary = quiz.getSessionSummary();
    assert.deepEqual(summary.context, { chapterTitle: "Ch1", unitId: 1 });
  });

  it("context defaults to empty object", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([mcProblem("m1", 0)]);
    quiz.start();
    quiz.selectOption(0);
    const summary = quiz.getSessionSummary();
    assert.deepEqual(summary.context, {});
  });

  it("context cleared on reset", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([mcProblem("m1", 0)], 0, { unitId: 1 });
    quiz.reset();
    const summary = quiz.getSessionSummary();
    assert.deepEqual(summary.context, {});
  });
});

// =============================================
// Breakdowns
// =============================================

describe("breakdowns", () => {
  it("breakdownByType groups correctly", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([
      mcProblem("m1", 0),
      mcProblem("m2", 0),
      numericProblem("n1", { answer: 100, tolerance: "exact" }),
    ]);
    quiz.start();

    // Answer each based on actual problem type due to shuffling
    for (let i = 0; i < 3; i++) {
      const p = quiz.problem;
      if (p.type === "numeric-input") {
        quiz.submitNumeric("100");
      } else {
        // Get first wrong, second right
        if (i === 0) {
          quiz.selectOption((p.correct + 1) % 4);
        } else {
          quiz.selectOption(p.correct);
        }
      }
      quiz.next();
    }

    const summary = quiz.getSessionSummary();
    const mcBreakdown = summary.breakdownByType["multiple-choice"];
    const numBreakdown = summary.breakdownByType["numeric-input"];

    assert.ok(mcBreakdown, "multiple-choice breakdown should exist");
    assert.ok(numBreakdown, "numeric-input breakdown should exist");
    assert.equal(mcBreakdown.total, 2);
    assert.equal(numBreakdown.total, 1);
    assert.equal(numBreakdown.correct, 1);
    assert.equal(numBreakdown.percentage, 100);
  });

  it("breakdownByType excludes skipped problems", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([mcProblem("m1", 0), mcProblem("m2", 0)]);
    quiz.start();

    quiz.skip(); // skip first
    quiz.selectOption(quiz.problem.correct); // answer second correctly

    const summary = quiz.getSessionSummary();
    const mcBreakdown = summary.breakdownByType["multiple-choice"];
    assert.equal(mcBreakdown.total, 1);
    assert.equal(mcBreakdown.correct, 1);
  });

  it("breakdownByTag groups by tag", () => {
    const quiz = new OpenQuizzer();
    const p1 = mcProblem("m1", 0);
    p1.tags = ["caching", "consistency"];
    const p2 = mcProblem("m2", 0);
    p2.tags = ["caching"];
    quiz.loadProblems([p1, p2]);
    quiz.start();

    // Answer both correctly
    quiz.selectOption(quiz.problem.correct);
    quiz.next();
    quiz.selectOption(quiz.problem.correct);

    const summary = quiz.getSessionSummary();
    assert.deepEqual(summary.breakdownByTag.caching, {
      correct: 2,
      total: 2,
      percentage: 100,
    });
    assert.deepEqual(summary.breakdownByTag.consistency, {
      correct: 1,
      total: 1,
      percentage: 100,
    });
  });

  it("breakdownByTag returns empty object when no tags", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([mcProblem("m1", 0)]);
    quiz.start();
    quiz.selectOption(0);
    const summary = quiz.getSessionSummary();
    assert.deepEqual(summary.breakdownByTag, {});
  });
});

// =============================================
// validateSessionSummary
// =============================================

describe("validateSessionSummary", () => {
  function minimalSession() {
    return {
      timestamp: "2025-02-10T12:00:00.000Z",
      score: { correct: 3, total: 5, percentage: 60, skipped: 0 },
      results: [{ id: "m1", type: "multiple-choice", correct: true, tags: [] }],
    };
  }

  it("valid minimal v2.5 summary (no context/tags/breakdowns)", () => {
    const result = validateSessionSummary(minimalSession());
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  it("valid full v2.7 summary", () => {
    const session = {
      ...minimalSession(),
      context: { unitTitle: "U1", chapterTitle: "C1" },
      breakdownByType: {
        "multiple-choice": { correct: 3, total: 5, percentage: 60 },
      },
      breakdownByTag: { caching: { correct: 2, total: 3, percentage: 67 } },
    };
    const result = validateSessionSummary(session);
    assert.equal(result.valid, true);
  });

  it("missing timestamp", () => {
    const session = minimalSession();
    delete session.timestamp;
    const result = validateSessionSummary(session);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("timestamp")));
  });

  it("invalid timestamp string", () => {
    const session = minimalSession();
    session.timestamp = "not-a-date";
    const result = validateSessionSummary(session);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("timestamp")));
  });

  it("missing score", () => {
    const session = minimalSession();
    delete session.score;
    const result = validateSessionSummary(session);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("score")));
  });

  it("missing results", () => {
    const session = minimalSession();
    delete session.results;
    const result = validateSessionSummary(session);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("results")));
  });

  it("non-object input (null, array, number, string)", () => {
    for (const input of [null, [1, 2], 42, "hello"]) {
      const result = validateSessionSummary(input);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("plain object")));
    }
  });
});

// =============================================
// deduplicateSessions
// =============================================

describe("deduplicateSessions", () => {
  it("no duplicates returns same length", () => {
    const sessions = [
      { timestamp: "2025-01-01T00:00:00Z" },
      { timestamp: "2025-01-02T00:00:00Z" },
    ];
    assert.equal(deduplicateSessions(sessions).length, 2);
  });

  it("duplicate timestamps — first kept, second removed", () => {
    const sessions = [
      { timestamp: "2025-01-01T00:00:00Z", label: "first" },
      { timestamp: "2025-01-01T00:00:00Z", label: "second" },
    ];
    const result = deduplicateSessions(sessions);
    assert.equal(result.length, 1);
    assert.equal(result[0].label, "first");
  });

  it("empty array returns empty array", () => {
    assert.deepEqual(deduplicateSessions([]), []);
  });
});

// =============================================
// computeAggregateStats
// =============================================

describe("computeAggregateStats", () => {
  function makeSession({
    timestamp = "2025-01-01T00:00:00Z",
    correct = 3,
    total = 5,
    skipped = 0,
    breakdownByType = null,
    breakdownByTag = null,
    context = null,
    results = null,
  } = {}) {
    const session = {
      timestamp,
      score: {
        correct,
        total,
        percentage: total > 0 ? Math.round((correct / total) * 100) : 0,
        skipped,
      },
      results: results || [],
    };
    if (breakdownByType) session.breakdownByType = breakdownByType;
    if (breakdownByTag) session.breakdownByTag = breakdownByTag;
    if (context) session.context = context;
    return session;
  }

  it("empty sessions — zero counts, empty sub-objects", () => {
    const stats = computeAggregateStats([]);
    assert.equal(stats.sessionCount, 0);
    assert.equal(stats.totalAnswered, 0);
    assert.equal(stats.totalCorrect, 0);
    assert.equal(stats.overallPercentage, 0);
    assert.equal(stats.totalSkipped, 0);
    assert.deepEqual(stats.byType, {});
    assert.deepEqual(stats.byTag, {});
    assert.deepEqual(stats.byUnit, {});
    assert.deepEqual(stats.byChapter, {});
    assert.deepEqual(stats.trend, []);
    assert.deepEqual(stats.mostMissed, []);
  });

  it("single session — matches that session's scores", () => {
    const stats = computeAggregateStats([
      makeSession({ correct: 4, total: 5, skipped: 1 }),
    ]);
    assert.equal(stats.sessionCount, 1);
    assert.equal(stats.totalAnswered, 5);
    assert.equal(stats.totalCorrect, 4);
    assert.equal(stats.overallPercentage, 80);
    assert.equal(stats.totalSkipped, 1);
  });

  it("multiple sessions — correct sum of totals", () => {
    const stats = computeAggregateStats([
      makeSession({ correct: 3, total: 5 }),
      makeSession({
        timestamp: "2025-01-02T00:00:00Z",
        correct: 7,
        total: 10,
      }),
    ]);
    assert.equal(stats.sessionCount, 2);
    assert.equal(stats.totalAnswered, 15);
    assert.equal(stats.totalCorrect, 10);
    assert.equal(stats.overallPercentage, 67);
  });

  it("byType sums breakdownByType across sessions", () => {
    const stats = computeAggregateStats([
      makeSession({
        breakdownByType: {
          "multiple-choice": { correct: 2, total: 3, percentage: 67 },
        },
      }),
      makeSession({
        timestamp: "2025-01-02T00:00:00Z",
        breakdownByType: {
          "multiple-choice": { correct: 4, total: 5, percentage: 80 },
          "numeric-input": { correct: 1, total: 2, percentage: 50 },
        },
      }),
    ]);
    assert.deepEqual(stats.byType["multiple-choice"], {
      correct: 6,
      total: 8,
      percentage: 75,
    });
    assert.deepEqual(stats.byType["numeric-input"], {
      correct: 1,
      total: 2,
      percentage: 50,
    });
  });

  it("byTag sums breakdownByTag, handles overlapping tags correctly", () => {
    const stats = computeAggregateStats([
      makeSession({
        breakdownByTag: {
          caching: { correct: 1, total: 2, percentage: 50 },
          consistency: { correct: 1, total: 1, percentage: 100 },
        },
      }),
      makeSession({
        timestamp: "2025-01-02T00:00:00Z",
        breakdownByTag: {
          caching: { correct: 2, total: 3, percentage: 67 },
        },
      }),
    ]);
    assert.deepEqual(stats.byTag.caching, {
      correct: 3,
      total: 5,
      percentage: 60,
    });
    assert.deepEqual(stats.byTag.consistency, {
      correct: 1,
      total: 1,
      percentage: 100,
    });
  });

  it("byUnit groups by context.unitTitle", () => {
    const stats = computeAggregateStats([
      makeSession({
        correct: 3,
        total: 5,
        context: { unitTitle: "Estimation" },
      }),
      makeSession({
        timestamp: "2025-01-02T00:00:00Z",
        correct: 4,
        total: 5,
        context: { unitTitle: "Estimation" },
      }),
    ]);
    assert.deepEqual(stats.byUnit.Estimation, {
      correct: 7,
      total: 10,
      percentage: 70,
    });
  });

  it("byChapter groups by context.chapterTitle", () => {
    const stats = computeAggregateStats([
      makeSession({
        correct: 2,
        total: 4,
        context: { chapterTitle: "Fundamentals" },
      }),
    ]);
    assert.deepEqual(stats.byChapter.Fundamentals, {
      correct: 2,
      total: 4,
      percentage: 50,
    });
  });

  it("trend — entries sorted by timestamp ascending", () => {
    const stats = computeAggregateStats([
      makeSession({ timestamp: "2025-01-03T00:00:00Z", correct: 1, total: 2 }),
      makeSession({ timestamp: "2025-01-01T00:00:00Z", correct: 3, total: 5 }),
      makeSession({ timestamp: "2025-01-02T00:00:00Z", correct: 4, total: 5 }),
    ]);
    assert.equal(stats.trend.length, 3);
    assert.equal(stats.trend[0].timestamp, "2025-01-01T00:00:00Z");
    assert.equal(stats.trend[1].timestamp, "2025-01-02T00:00:00Z");
    assert.equal(stats.trend[2].timestamp, "2025-01-03T00:00:00Z");
  });

  it("mostMissed — sorted by wrongCount desc, top 10 limit", () => {
    // Create 12 problems, each wrong different numbers of times
    const results = [];
    for (let i = 0; i < 12; i++) {
      for (let j = 0; j <= i; j++) {
        results.push({
          id: `p${i}`,
          question: `Problem ${i}`,
          correct: false,
        });
      }
      // Also add a "seen" result that was correct
      results.push({ id: `p${i}`, question: `Problem ${i}`, correct: true });
    }
    const stats = computeAggregateStats([
      makeSession({ correct: 12, total: 90, results }),
    ]);
    assert.equal(stats.mostMissed.length, 10);
    // Most wrong should be p11 (12 wrongs)
    assert.equal(stats.mostMissed[0].id, "p11");
    assert.equal(stats.mostMissed[0].wrongCount, 12);
  });

  it("sessions without context — byUnit/byChapter skip them, no crash", () => {
    const stats = computeAggregateStats([
      makeSession({ correct: 3, total: 5 }),
    ]);
    assert.deepEqual(stats.byUnit, {});
    assert.deepEqual(stats.byChapter, {});
    assert.equal(stats.totalAnswered, 5);
  });

  it("sessions without breakdowns — byType/byTag skip them, no crash", () => {
    const stats = computeAggregateStats([
      makeSession({ correct: 3, total: 5 }),
    ]);
    assert.deepEqual(stats.byType, {});
    assert.deepEqual(stats.byTag, {});
  });

  it("skipped results excluded from mostMissed counts", () => {
    const stats = computeAggregateStats([
      makeSession({
        correct: 0,
        total: 1,
        results: [
          { id: "s1", question: "Q1", skipped: true, correct: false },
          { id: "m1", question: "Q2", correct: false },
        ],
      }),
    ]);
    // Only m1 should appear in mostMissed, s1 was skipped
    assert.equal(stats.mostMissed.length, 1);
    assert.equal(stats.mostMissed[0].id, "m1");
  });
});

// =============================================
// index.html UI wiring contracts
// =============================================
//
// Static contract tests that read index.html as a string and verify
// critical UI functions, event listeners, and DOM bindings exist.
// These would have caught the v2.4 accidental deletion of ~200 lines
// of UI code that all 59 engine-only tests missed.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const html = readFileSync(join(__dirname, "index.html"), "utf-8");

// Extract the <script type="module"> block for targeted checks
const scriptMatch = html.match(/<script type="module">([\s\S]*?)<\/script>/);
const script = scriptMatch ? scriptMatch[1] : "";

describe("index.html UI wiring contracts", () => {
  // -----------------------------------------
  // Function definitions
  // -----------------------------------------

  describe("function definitions", () => {
    const requiredFunctions = [
      // UI helpers
      "showError",
      "hideError",
      "hideAllQuestionTypes",
      // Landing/navigation
      "renderUnitList",
      "loadUnit",
      "loadChapter",
      "startPractice",
      "backToMenu",
      // Renderers
      "renderMultipleChoiceQuestion",
      "renderNumericQuestion",
      "renderMultiSelectQuestion",
      "renderTwoStageQuestion",
      "renderOrderingQuestion",
      // Feedback/results
      "showFeedback",
      "showResultsView",
      "updateOrderingDisplay",
      // Breakdown renderers
      "renderBreakdownSection",
      "renderTypeBreakdown",
      "renderTagBreakdown",
      // v2.8 — Dashboard & history
      "renderDashboard",
      "showDashboard",
      "hideDashboard",
      "loadHistoryFromPaste",
      "saveToLocalStorage",
      "loadFromLocalStorage",
      "clearHistory",
      "exportAllHistory",
      "renderHistorySummary",
      "renderTrendSection",
      "renderMostMissed",
    ];

    for (const name of requiredFunctions) {
      it(`defines function ${name}`, () => {
        assert.ok(
          script.includes(`function ${name}(`),
          `missing function ${name}() — UI will not function`,
        );
      });
    }
  });

  // -----------------------------------------
  // Engine event listener registrations
  // -----------------------------------------

  describe("engine event listener registrations", () => {
    const requiredEvents = [
      "questionShow",
      "optionSelected",
      "twoStageAdvance",
      "numericResult",
      "multiSelectToggle",
      "multiSelectResult",
      "orderingUpdate",
      "orderingResult",
      "complete",
      "skip",
    ];

    for (const event of requiredEvents) {
      it(`registers quiz.on("${event}")`, () => {
        // Prettier may break quiz.on(\n  "event" across lines
        const pattern = new RegExp(`quiz\\.on\\(\\s*"${event}"`);
        assert.ok(
          pattern.test(script),
          `missing quiz.on("${event}") — engine event will be ignored`,
        );
      });
    }
  });

  // -----------------------------------------
  // Engine imports
  // -----------------------------------------

  describe("engine imports", () => {
    const requiredImports = [
      "validateSessionSummary",
      "deduplicateSessions",
      "computeAggregateStats",
    ];

    for (const name of requiredImports) {
      it(`imports ${name} from openquizzer.js`, () => {
        assert.ok(
          script.includes(name),
          `missing import of ${name} — aggregate features will not work`,
        );
      });
    }
  });

  // -----------------------------------------
  // DOM event bindings
  // -----------------------------------------

  describe("DOM event bindings", () => {
    it("binds optionsEl click delegation", () => {
      assert.ok(
        script.includes('optionsEl.addEventListener("click"') ||
          script.includes("optionsEl.addEventListener('click'"),
        "missing optionsEl click listener — MC/multi-select clicks will be ignored",
      );
    });

    it("binds numericSubmit click", () => {
      assert.ok(
        script.includes('numericSubmit.addEventListener("click"') ||
          script.includes("numericSubmit.addEventListener('click'"),
        "missing numericSubmit click listener — numeric answers cannot be submitted",
      );
    });

    it("binds numericInput keydown for Enter", () => {
      assert.ok(
        script.includes('numericInput.addEventListener("keydown"') ||
          script.includes("numericInput.addEventListener('keydown'"),
        "missing numericInput keydown listener — Enter key will not submit",
      );
    });

    it("binds orderingItems click for tap-to-swap", () => {
      assert.ok(
        script.includes('orderingItems.addEventListener("click"') ||
          script.includes("orderingItems.addEventListener('click'"),
        "missing orderingItems click listener — tap-to-swap will not work",
      );
    });

    it("binds orderingItems keydown for keyboard nav", () => {
      assert.ok(
        script.includes('orderingItems.addEventListener("keydown"') ||
          script.includes("orderingItems.addEventListener('keydown'"),
        "missing orderingItems keydown listener — keyboard ordering will not work",
      );
    });

    it("binds skipBtn click", () => {
      assert.ok(
        script.includes('skipBtn.addEventListener("click"') ||
          script.includes("skipBtn.addEventListener('click'"),
        "missing skipBtn click listener — skip button will not work",
      );
    });

    // v2.8 — Dashboard & history event bindings
    const v28Bindings = [
      ["dashboardBtn", "click", "dashboard button"],
      ["loadHistoryBtn", "click", "import history button"],
      ["importSubmitBtn", "click", "import submit button"],
      ["importCancelBtn", "click", "import cancel button"],
      ["dashboardBackBtn", "click", "dashboard back button"],
      ["exportAllBtn", "click", "export all button"],
      ["clearHistoryBtn", "click", "clear history button"],
      ["resultsDashboardBtn", "click", "results dashboard button"],
    ];

    for (const [element, event, label] of v28Bindings) {
      it(`binds ${element} ${event}`, () => {
        assert.ok(
          script.includes(`${element}.addEventListener("${event}"`) ||
            script.includes(`${element}.addEventListener('${event}'`),
          `missing ${element} ${event} listener — ${label} will not work`,
        );
      });
    }
  });

  // -----------------------------------------
  // DOM element references (spot-checks)
  // -----------------------------------------

  describe("DOM element references", () => {
    const requiredIds = [
      "multi-submit-container",
      "stage-indicator",
      "stage-context",
      "stage-context-text",
      "ordering-submit",
      "skip-btn",
      "results-breakdown",
      // v2.8 — Dashboard & history
      "dashboard",
      "dashboard-btn",
      "load-history-btn",
      "import-textarea",
      "import-submit-btn",
      "export-all-btn",
      "clear-history-btn",
      "results-dashboard-btn",
      "dashboard-back-btn",
      "history-section",
      // Detailed explanation
      "feedback-detail-toggle",
      "feedback-detail",
    ];

    for (const id of requiredIds) {
      it(`references getElementById("${id}")`, () => {
        // Prettier may break getElementById(\n  "id" across lines
        const pattern = new RegExp(`getElementById\\(\\s*"${id}"`);
        assert.ok(
          pattern.test(script),
          `missing getElementById("${id}") — element will be unreachable`,
        );
      });
    }
  });

  // -----------------------------------------
  // Runtime meta tag customization
  // -----------------------------------------

  describe("runtime meta tag customization", () => {
    it("sets document.title from CONFIG.title", () => {
      assert.ok(
        script.includes("document.title = CONFIG.title"),
        "missing document.title = CONFIG.title — page title won't reflect instance config",
      );
    });

    it("sets meta description from CONFIG.description", () => {
      assert.ok(
        script.includes('.setAttribute("content", CONFIG.description)'),
        "missing meta description update — description won't reflect instance config",
      );
    });
  });

  // -----------------------------------------
  // Static meta tags match CONFIG
  // -----------------------------------------
  //
  // The static <title> and <meta description> must match CONFIG values
  // so link preview crawlers (which don't run JS) show the correct info.
  // In the template repo, CONFIG has the generic defaults; in instances,
  // CONFIG has instance-specific values. Either way, the static HTML
  // must agree with CONFIG.

  describe("static meta tags match CONFIG", () => {
    it("static <title> matches CONFIG.title", () => {
      assert.ok(
        html.includes(`<title>${CONFIG.title}</title>`),
        `static <title> does not match CONFIG.title ("${CONFIG.title}") — update the <title> tag in index.html`,
      );
    });

    it("static meta description matches CONFIG.description", () => {
      assert.ok(
        html.includes(`content="${CONFIG.description}"`),
        `static meta description does not match CONFIG.description — update the <meta description> tag in index.html`,
      );
    });
  });

  // -----------------------------------------
  // References rendering
  // -----------------------------------------

  describe("references rendering", () => {
    it("renders references-list in showFeedback", () => {
      assert.ok(
        script.includes("references-list"),
        "missing references-list class — references will not render",
      );
    });
  });

  // -----------------------------------------
  // Agent artifact rejection
  // -----------------------------------------

  describe("agent artifact rejection", () => {
    it("contains no '// ... existing code ...' markers", () => {
      assert.ok(
        !html.includes("// ... existing code ..."),
        "found '// ... existing code ...' marker — agent artifact left in file",
      );
    });
  });
});
