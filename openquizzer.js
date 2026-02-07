// OpenQuizzer — zero-dependency quiz engine ES module
// Manages quiz state and emits events without touching the DOM.

// =============================================
// Module-private utilities (not exported)
// =============================================

const DEFAULT_TYPE_WEIGHTS = {
  "multiple-choice": 1,
  "numeric-input": 1.5,
  ordering: 2,
  "multi-select": 1.5,
  "two-stage": 2,
};

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Shuffle problems so question types are evenly distributed rather than
 * clustered together. Higher-weight types get picked more often from
 * their pool, producing a balanced mix across the session.
 */
function weightedShuffle(problems, typeWeights) {
  const byType = {};
  problems.forEach((p) => {
    const type = p.type || "multiple-choice";
    if (!byType[type]) byType[type] = [];
    byType[type].push(p);
  });

  Object.keys(byType).forEach((type) => {
    shuffleArray(byType[type]);
  });

  const result = [];
  const typeQueues = Object.entries(byType).map(([type, items]) => ({
    type,
    items: [...items],
    weight: typeWeights[type] !== undefined ? typeWeights[type] : 1,
  }));

  while (typeQueues.some((q) => q.items.length > 0)) {
    const totalWeight = typeQueues.reduce(
      (sum, q) => sum + (q.items.length > 0 ? q.weight : 0),
      0,
    );

    if (totalWeight === 0) break;

    let rand = Math.random() * totalWeight;
    for (const q of typeQueues) {
      if (q.items.length === 0) continue;
      rand -= q.weight;
      if (rand <= 0) {
        result.push(q.items.shift());
        break;
      }
    }
  }

  return result;
}

function parseNumericInput(input) {
  let cleaned = input.replace(/[,\s]/g, "").toLowerCase();

  const suffixes = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 };
  for (const [suffix, multiplier] of Object.entries(suffixes)) {
    if (cleaned.endsWith(suffix)) {
      return parseFloat(cleaned.slice(0, -1)) * multiplier;
    }
  }

  return parseFloat(cleaned);
}

function checkNumericAnswer(userValue, correctValue, tolerance) {
  if (isNaN(userValue)) return false;
  if (correctValue === 0) return userValue === 0;

  if (tolerance === "order-of-magnitude") {
    const ratio = userValue / correctValue;
    return ratio >= 0.1 && ratio <= 10;
  } else if (tolerance === "exact") {
    return userValue === correctValue;
  } else if (typeof tolerance === "number") {
    const diff = Math.abs(userValue - correctValue) / correctValue;
    return diff <= tolerance;
  } else {
    // Default: 50% tolerance when no tolerance is specified
    const diff = Math.abs(userValue - correctValue) / correctValue;
    return diff <= 0.5;
  }
}

function formatNumber(num) {
  if (num < 0) return "-" + formatNumber(-num);

  const format = (val, suffix) => {
    const fixed = val.toFixed(1);
    const trimmed = fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed; // 5.0 → "5", 5.3 → "5.3"
    return trimmed + suffix;
  };

  if (num >= 1e12) return format(num / 1e12, "T");
  if (num >= 1e9) return format(num / 1e9, "B");
  if (num >= 1e6) return format(num / 1e6, "M");
  if (num >= 1e3) return format(num / 1e3, "K");
  return num.toString();
}

export class OpenQuizzer {
  // State machine: idle → practicing → answered → complete
  #state = "idle";
  #listeners = {};
  #typeWeights;

  // Problem data
  #problems = [];
  #allProblems = [];
  #maxProblems = 0; // 0 = unlimited
  #currentIndex = 0;
  #answers = [];

  // Per-question state
  #answered = false;
  #multiSelectSelected = new Set();
  #orderingOrder = [];
  #twoStageIndex = 0;
  #twoStageAnswers = [];

  constructor({ typeWeights } = {}) {
    this.#typeWeights = { ...DEFAULT_TYPE_WEIGHTS, ...typeWeights };
  }

  // --- Event system ---

  on(event, fn) {
    if (!this.#listeners[event]) this.#listeners[event] = [];
    this.#listeners[event].push(fn);
    return this;
  }

  off(event, fn) {
    if (!this.#listeners[event]) return this;
    this.#listeners[event] = this.#listeners[event].filter((f) => f !== fn);
    return this;
  }

  #emit(event, payload) {
    if (this.#listeners[event]) {
      this.#listeners[event].forEach((fn) => fn(payload));
    }
  }

  #setState(to) {
    const from = this.#state;
    if (from === to) return;
    this.#state = to;
    this.#emit("stateChange", { from, to });
  }

  // --- Read-only getters ---

  get state() {
    return this.#state;
  }

  get progress() {
    return { current: this.#currentIndex + 1, total: this.#problems.length };
  }

  get score() {
    const correct = this.#answers.filter((a) => a.correct).length;
    const total = this.#answers.length;
    return {
      correct,
      total,
      percentage: total > 0 ? Math.round((correct / total) * 100) : 0,
    };
  }

  get problem() {
    if (this.#state === "idle" || this.#state === "complete") return null;
    return this.#problems[this.#currentIndex];
  }

  get answers() {
    return [...this.#answers];
  }

  // --- Lifecycle ---

  loadProblems(problems, maxProblems = 0) {
    this.#allProblems = [...problems];
    this.#maxProblems = maxProblems;
    this.#problems = weightedShuffle([...problems], this.#typeWeights);

    if (this.#maxProblems > 0 && this.#problems.length > this.#maxProblems) {
      this.#problems = this.#problems.slice(0, this.#maxProblems);
    }

    this.#currentIndex = 0;
    this.#answers = [];
    this.#resetQuestionState();
    this.#setState("idle");
  }

  start() {
    if (this.#problems.length === 0) return;
    this.#currentIndex = 0;
    this.#answers = [];
    this.#setState("practicing");
    this.#emitCurrentQuestion();
  }

  next() {
    if (this.#state !== "answered") return;
    if (this.#currentIndex < this.#problems.length - 1) {
      this.#currentIndex++;
      this.#setState("practicing");
      this.#emitCurrentQuestion();
    } else {
      this.#complete();
    }
  }

  retry() {
    this.#problems = weightedShuffle([...this.#allProblems], this.#typeWeights);

    if (this.#maxProblems > 0 && this.#problems.length > this.#maxProblems) {
      this.#problems = this.#problems.slice(0, this.#maxProblems);
    }

    this.#currentIndex = 0;
    this.#answers = [];
    this.#resetQuestionState();
    this.#setState("practicing");
    this.#emitCurrentQuestion();
  }

  reset() {
    this.#problems = [];
    this.#allProblems = [];
    this.#maxProblems = 0;
    this.#currentIndex = 0;
    this.#answers = [];
    this.#resetQuestionState();
    this.#setState("idle");
  }

  // --- Answer methods ---

  selectOption(index) {
    if (this.#state !== "practicing") return;
    const problem = this.#problems[this.#currentIndex];
    const type = problem.type || "multiple-choice";

    if (type === "two-stage") {
      this.#handleTwoStageSelect(index);
    } else {
      this.#handleMultipleChoiceSelect(index);
    }
  }

  toggleMultiSelect(index) {
    if (this.#state !== "practicing") return;
    if (this.#answered) return;

    if (this.#multiSelectSelected.has(index)) {
      this.#multiSelectSelected.delete(index);
    } else {
      this.#multiSelectSelected.add(index);
    }

    this.#emit("multiSelectToggle", {
      index,
      selected: this.#multiSelectSelected.has(index),
    });
  }

  submitMultiSelect() {
    if (this.#state !== "practicing") return;
    if (this.#answered) return;

    this.#answered = true;
    const problem = this.#problems[this.#currentIndex];
    const selected = Array.from(this.#multiSelectSelected).sort();
    const correct = [...problem.correctIndices].sort();

    const isCorrect =
      selected.length === correct.length &&
      selected.every((v, i) => v === correct[i]);

    this.#answers.push({
      problemId: problem.id,
      selected,
      correctIndices: correct,
      correct: isCorrect,
    });

    this.#setState("answered");
    this.#emit("multiSelectResult", {
      selected,
      correctIndices: problem.correctIndices,
      correct: isCorrect,
      explanation: problem.explanation,
    });
  }

  submitNumeric(rawString) {
    if (this.#state !== "practicing") return;
    if (this.#answered) return;
    if (!rawString || !rawString.trim()) return;

    this.#answered = true;
    const problem = this.#problems[this.#currentIndex];
    const userValue = parseNumericInput(rawString.trim());
    const isCorrect = checkNumericAnswer(
      userValue,
      problem.answer,
      problem.tolerance,
    );

    this.#answers.push({
      problemId: problem.id,
      userValue,
      correctValue: problem.answer,
      correct: isCorrect,
    });

    this.#setState("answered");
    this.#emit("numericResult", {
      userValue,
      correctValue: problem.answer,
      correct: isCorrect,
      formatted: formatNumber(problem.answer),
      unit: problem.unit || "",
      explanation: problem.explanation,
    });
  }

  placeOrderingItem(originalIndex) {
    if (this.#state !== "practicing") return;
    if (this.#answered) return;

    // If already placed, ignore (use removeOrderingItem to remove)
    if (this.#orderingOrder.includes(originalIndex)) return;

    this.#orderingOrder.push(originalIndex);
    const problem = this.#problems[this.#currentIndex];
    const complete = this.#orderingOrder.length === problem.items.length;

    this.#emit("orderingUpdate", {
      order: [...this.#orderingOrder],
      complete,
    });

    if (complete) {
      this.#gradeOrdering();
    }
  }

  removeOrderingItem(originalIndex) {
    if (this.#state !== "practicing") return;
    if (this.#answered) return;

    const pos = this.#orderingOrder.indexOf(originalIndex);
    if (pos === -1) return;

    this.#orderingOrder.splice(pos, 1);

    this.#emit("orderingUpdate", {
      order: [...this.#orderingOrder],
      complete: false,
    });
  }

  resetOrdering() {
    if (this.#state !== "practicing") return;
    if (this.#answered) return;

    this.#orderingOrder = [];
    this.#emit("orderingUpdate", { order: [], complete: false });
  }

  // --- Private helpers ---

  #resetQuestionState() {
    this.#answered = false;
    this.#multiSelectSelected = new Set();
    this.#orderingOrder = [];
    this.#twoStageIndex = 0;
    this.#twoStageAnswers = [];
  }

  #emitCurrentQuestion() {
    this.#resetQuestionState();
    const problem = this.#problems[this.#currentIndex];
    const type = problem.type || "multiple-choice";

    let shuffledItems;
    if (type === "ordering") {
      const shuffledIndices = [...Array(problem.items.length).keys()];
      shuffleArray(shuffledIndices);
      shuffledItems = shuffledIndices.map((i) => ({
        originalIndex: i,
        text: problem.items[i],
      }));
    }

    this.#emit("questionShow", {
      problem,
      index: this.#currentIndex,
      total: this.#problems.length,
      type,
      shuffledItems,
    });
  }

  #handleMultipleChoiceSelect(index) {
    if (this.#answered) return;
    this.#answered = true;

    const problem = this.#problems[this.#currentIndex];
    const isCorrect = index === problem.correct;

    this.#answers.push({
      problemId: problem.id,
      selected: index,
      correct: isCorrect,
    });

    this.#setState("answered");
    this.#emit("optionSelected", {
      index,
      correct: isCorrect,
      correctIndex: problem.correct,
      explanation: problem.explanation,
    });
  }

  #handleTwoStageSelect(index) {
    const problem = this.#problems[this.#currentIndex];
    const stageIndex = this.#twoStageIndex;
    const stage = problem.stages[stageIndex];
    const isCorrect = index === stage.correct;

    this.#twoStageAnswers.push({ selected: index, correct: isCorrect });

    if (stageIndex < problem.stages.length - 1) {
      // Advance to next stage — emit result for this stage but stay in 'practicing'
      this.#twoStageIndex = stageIndex + 1;
      const nextStage = problem.stages[stageIndex + 1];

      this.#emit("twoStageAdvance", {
        stageIndex,
        totalStages: problem.stages.length,
        stageResult: {
          index,
          correct: isCorrect,
          correctIndex: stage.correct,
        },
        nextStage: {
          stageIndex: stageIndex + 1,
          question: nextStage.question,
          options: nextStage.options,
          previousAnswer: stage.options[index],
        },
      });
    } else {
      // Final stage — grade the overall problem (correct only if ALL stages correct)
      this.#answered = true;
      const allCorrect = this.#twoStageAnswers.every((a) => a.correct);

      this.#answers.push({
        problemId: problem.id,
        stageAnswers: [...this.#twoStageAnswers],
        correct: allCorrect,
      });

      this.#setState("answered");
      this.#emit("optionSelected", {
        index,
        correct: isCorrect,
        correctIndex: stage.correct,
        explanation: stage.explanation,
        isFinalStage: true,
        allCorrect,
      });
    }
  }

  #gradeOrdering() {
    this.#answered = true;
    const problem = this.#problems[this.#currentIndex];

    const isCorrect = this.#orderingOrder.every(
      (originalIndex, position) =>
        problem.correctOrder[position] === originalIndex,
    );

    this.#answers.push({
      problemId: problem.id,
      userOrder: [...this.#orderingOrder],
      correct: isCorrect,
    });

    this.#setState("answered");
    this.#emit("orderingResult", {
      userOrder: [...this.#orderingOrder],
      correctOrder: problem.correctOrder,
      correct: isCorrect,
      explanation: problem.explanation,
    });
  }

  #complete() {
    const finalScore = this.score;
    this.#setState("complete");
    this.#emit("complete", {
      correct: finalScore.correct,
      total: finalScore.total,
      percentage: finalScore.percentage,
      answers: this.answers,
    });
  }
}
