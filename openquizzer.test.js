import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { OpenQuizzer } from "./openquizzer.js";

// =============================================
// Test fixtures
// =============================================

function mcProblem(id, correct = 1) {
  return {
    id,
    type: "multiple-choice",
    question: `MC ${id}`,
    options: ["A", "B", "C", "D"],
    correct,
    explanation: `Explanation for ${id}`,
  };
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
    assert.deepEqual(quiz.score, { correct: 0, total: 0, percentage: 0 });
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
  it("correct order auto-grades", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([orderingProblem("o1")]);
    quiz.start();
    const updates = collectEvents(quiz, "orderingUpdate");
    const results = collectEvents(quiz, "orderingResult");

    quiz.placeOrderingItem(0);
    quiz.placeOrderingItem(1);
    quiz.placeOrderingItem(2);

    assert.equal(results.length, 1);
    assert.equal(results[0].correct, true);
    assert.deepEqual(results[0].userOrder, [0, 1, 2]);
    assert.equal(quiz.state, "answered");
  });

  it("incorrect order", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([orderingProblem("o1")]);
    quiz.start();
    const results = collectEvents(quiz, "orderingResult");

    quiz.placeOrderingItem(2);
    quiz.placeOrderingItem(1);
    quiz.placeOrderingItem(0);

    assert.equal(results[0].correct, false);
  });

  it("remove and re-place", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([orderingProblem("o1")]);
    quiz.start();
    const updates = collectEvents(quiz, "orderingUpdate");

    quiz.placeOrderingItem(2);
    quiz.placeOrderingItem(1);
    quiz.removeOrderingItem(2);

    assert.deepEqual(updates[updates.length - 1].order, [1]);
    assert.equal(updates[updates.length - 1].complete, false);
  });

  it("resetOrdering clears order", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([orderingProblem("o1")]);
    quiz.start();
    const updates = collectEvents(quiz, "orderingUpdate");

    quiz.placeOrderingItem(0);
    quiz.placeOrderingItem(1);
    quiz.resetOrdering();

    assert.deepEqual(updates[updates.length - 1].order, []);
  });

  it("duplicate place is ignored", () => {
    const quiz = new OpenQuizzer();
    quiz.loadProblems([orderingProblem("o1")]);
    quiz.start();
    const updates = collectEvents(quiz, "orderingUpdate");

    quiz.placeOrderingItem(0);
    quiz.placeOrderingItem(0); // should be ignored

    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0].order, [0]);
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
        p.correctOrder.forEach((idx) => quiz.placeOrderingItem(idx));
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
    const result = quiz.on("stateChange", () => { });
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
    // Access internal problems by iterating
    // We have to rely on side channels since there's no public API to get all problems
    // But we know next() iterates.
    quiz.start();
    while (quiz.state === "practicing") {
      types.push(quiz.problem.type);
      if (quiz.progress.current < quiz.progress.total) { // Avoid completing
        // Hack: manually advance index without answering to inspect all
        // Actually, we can just answer correctly to move fast
        const p = quiz.problem;
        if (p.type === 'multiple-choice') quiz.selectOption(p.correct);
        else if (p.type === 'numeric-input') quiz.submitNumeric(String(p.answer));
        else if (p.type === 'ordering') p.correctOrder.forEach(i => quiz.placeOrderingItem(i));
        else if (p.type === 'multi-select') {
          p.correctIndices.forEach(i => quiz.toggleMultiSelect(i));
          quiz.submitMultiSelect();
        }
        else if (p.type === 'two-stage') {
          quiz.selectOption(p.stages[0].correct);
          // wait for timeout? Test env might need handling.
          // Actually, let's just use a simpler approach: 
          // The shuffle happens in loadProblems.
          // We can check the first problem of many sessions to see distribution.
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
    const problems = [
      mcProblem("m1"),
      numericProblem("n1"),
    ];

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
    assert.ok(numericFirst > 40, `Numeric should be first most times (got ${numericFirst}/${iterations})`);
  });

  it("0 weight suppresses type", () => {
    const typeWeights = { "multiple-choice": 1, "numeric-input": 0 };
    const problems = [
      mcProblem("m1"),
      mcProblem("m2"),
      numericProblem("n1"),
    ];

    // Test multiple times to ensure it never appears
    for (let i = 0; i < 10; i++) {
      const quiz = new OpenQuizzer({ typeWeights });
      quiz.loadProblems(problems);
      quiz.start();

      while (quiz.state === "practicing") {
        assert.notEqual(quiz.problem.type, "numeric-input");
        if (quiz.problem.type === 'multiple-choice') quiz.selectOption(0); // arbitrary answer
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

    assert.ok(mcFirst > 40, `MC should be first most times (got ${mcFirst}/${iterations})`);
  });
});
