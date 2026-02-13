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

// =============================================
// Exported standalone utilities (not on the class)
// =============================================

export function validateSessionSummary(obj) {
  const errors = [];
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return { valid: false, errors: ["Input must be a plain object"] };
  }
  if (!obj.timestamp || isNaN(Date.parse(obj.timestamp))) {
    errors.push("Missing or invalid timestamp");
  }
  if (
    !obj.score ||
    typeof obj.score.correct !== "number" ||
    typeof obj.score.total !== "number"
  ) {
    errors.push("Missing or invalid score (needs correct and total)");
  }
  if (!Array.isArray(obj.results)) {
    errors.push("Missing results array");
  }
  return { valid: errors.length === 0, errors };
}

export function deduplicateSessions(sessions) {
  const seen = new Set();
  return sessions.filter((s) => {
    if (seen.has(s.timestamp)) return false;
    seen.add(s.timestamp);
    return true;
  });
}

export function computeAggregateStats(sessions) {
  let totalAnswered = 0;
  let totalCorrect = 0;
  let totalSkipped = 0;

  const byType = {};
  const byTag = {};
  const byUnit = {};
  const byChapter = {};
  const problemStats = {};

  for (const session of sessions) {
    totalAnswered += session.score.total;
    totalCorrect += session.score.correct;
    totalSkipped += session.score.skipped || 0;

    // byType from breakdownByType
    if (session.breakdownByType) {
      for (const [type, stats] of Object.entries(session.breakdownByType)) {
        if (!byType[type]) byType[type] = { correct: 0, total: 0 };
        byType[type].correct += stats.correct;
        byType[type].total += stats.total;
      }
    }

    // byTag from breakdownByTag
    if (session.breakdownByTag) {
      for (const [tag, stats] of Object.entries(session.breakdownByTag)) {
        if (!byTag[tag]) byTag[tag] = { correct: 0, total: 0 };
        byTag[tag].correct += stats.correct;
        byTag[tag].total += stats.total;
      }
    }

    // byUnit / byChapter from context
    if (session.context) {
      if (session.context.unitTitle) {
        const key = session.context.unitTitle;
        if (!byUnit[key]) byUnit[key] = { correct: 0, total: 0 };
        byUnit[key].correct += session.score.correct;
        byUnit[key].total += session.score.total;
      }
      if (session.context.chapterTitle) {
        const key = session.context.chapterTitle;
        if (!byChapter[key]) byChapter[key] = { correct: 0, total: 0 };
        byChapter[key].correct += session.score.correct;
        byChapter[key].total += session.score.total;
      }
    }

    // mostMissed: track per-problem stats
    if (Array.isArray(session.results)) {
      for (const result of session.results) {
        if (result.skipped) continue;
        if (!problemStats[result.id]) {
          problemStats[result.id] = {
            id: result.id,
            question: result.question || "",
            wrongCount: 0,
            seenCount: 0,
          };
        }
        problemStats[result.id].seenCount++;
        if (!result.correct) {
          problemStats[result.id].wrongCount++;
        }
      }
    }
  }

  // Compute percentages for breakdown objects
  const addPercentages = (obj) => {
    for (const entry of Object.values(obj)) {
      entry.percentage =
        entry.total > 0 ? Math.round((entry.correct / entry.total) * 100) : 0;
    }
  };
  addPercentages(byType);
  addPercentages(byTag);
  addPercentages(byUnit);
  addPercentages(byChapter);

  // trend: one entry per session sorted by timestamp asc
  const trend = sessions
    .map((s) => ({
      timestamp: s.timestamp,
      percentage: s.score.percentage,
      correct: s.score.correct,
      total: s.score.total,
    }))
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  // mostMissed: top 10 by wrongCount desc
  const mostMissed = Object.values(problemStats)
    .filter((p) => p.wrongCount > 0)
    .sort((a, b) => b.wrongCount - a.wrongCount)
    .slice(0, 10)
    .map((p) => ({
      id: p.id,
      question: p.question,
      wrongCount: p.wrongCount,
      seenCount: p.seenCount,
      percentage:
        p.seenCount > 0 ? Math.round((p.wrongCount / p.seenCount) * 100) : 0,
    }));

  return {
    sessionCount: sessions.length,
    totalAnswered,
    totalCorrect,
    overallPercentage:
      totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0,
    totalSkipped,
    byType,
    byTag,
    byUnit,
    byChapter,
    trend,
    mostMissed,
  };
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
  #context = {};

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
    const answered = this.#answers.filter((a) => !a.skipped);
    const correct = answered.filter((a) => a.correct).length;
    const total = answered.length;
    const skipped = this.#answers.length - total;
    return {
      correct,
      total,
      percentage: total > 0 ? Math.round((correct / total) * 100) : 0,
      skipped,
    };
  }

  get problem() {
    if (this.#state === "idle" || this.#state === "complete") return null;
    return this.#problems[this.#currentIndex];
  }

  get answers() {
    return [...this.#answers];
  }

  /**
   * Returns a snapshot of the current session results.
   * Safe to call at any point (idle, practicing, answered, complete).
   */
  getSessionSummary() {
    const score = this.score;
    const problemsById = new Map(
      this.#problems.map((problem) => [problem.id, problem]),
    );
    const results = this.#answers.map((answer) => {
      const problem = problemsById.get(answer.problemId);
      return this.#buildSummaryResult(problem, answer);
    });

    return {
      timestamp: new Date().toISOString(),
      context: { ...this.#context },
      score: {
        correct: score.correct,
        total: score.total,
        percentage: score.percentage,
        skipped: score.skipped,
      },
      results,
      breakdownByType: this.#computeTypeBreakdown(),
      breakdownByTag: this.#computeTagBreakdown(),
    };
  }

  // --- Lifecycle ---

  loadProblems(problems, maxProblems = 0, context = {}) {
    this.#allProblems = [...problems];
    this.#maxProblems = maxProblems;
    this.#context = { ...context };
    this.#problems = weightedShuffle([...problems], this.#typeWeights);
    this.#applyMaxProblems();

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
    this.#applyMaxProblems();

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
    this.#context = {};
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
      detailedExplanation: problem.detailedExplanation,
      references: problem.references,
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
      detailedExplanation: problem.detailedExplanation,
      references: problem.references,
    });
  }

  moveOrderingItem(fromIndex, toIndex) {
    if (this.#state !== "practicing") return;
    if (this.#answered) return;

    if (
      fromIndex < 0 ||
      fromIndex >= this.#orderingOrder.length ||
      toIndex < 0 ||
      toIndex >= this.#orderingOrder.length
    ) {
      return;
    }

    const item = this.#orderingOrder[fromIndex];
    this.#orderingOrder.splice(fromIndex, 1);
    this.#orderingOrder.splice(toIndex, 0, item);

    this.#emit("orderingUpdate", {
      order: [...this.#orderingOrder],
    });
  }

  submitOrdering() {
    if (this.#state !== "practicing") return;
    if (this.#answered) return;
    this.#gradeOrdering();
  }

  skip() {
    if (this.#state !== "practicing") return;
    const problem = this.#problems[this.#currentIndex];
    this.#answers.push({
      problemId: problem.id,
      skipped: true,
      correct: false,
    });
    this.#emit("skip", {
      problemId: problem.id,
      index: this.#currentIndex,
      total: this.#problems.length,
    });
    if (this.#currentIndex < this.#problems.length - 1) {
      this.#currentIndex++;
      this.#emitCurrentQuestion();
    } else {
      this.#complete();
    }
  }

  // --- Private helpers ---

  #applyMaxProblems() {
    if (this.#maxProblems > 0 && this.#problems.length > this.#maxProblems) {
      this.#problems = this.#problems.slice(0, this.#maxProblems);
    }
  }

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
      this.#orderingOrder = [...shuffledIndices];
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
      detailedExplanation: problem.detailedExplanation,
      references: problem.references,
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
        detailedExplanation: stage.detailedExplanation,
        references: stage.references,
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
      detailedExplanation: problem.detailedExplanation,
      references: problem.references,
    });
  }

  // Invariant: #answers[i] always corresponds to #problems[i] because
  // questions are answered/skipped sequentially (no random access).
  #computeTypeBreakdown() {
    const breakdown = {};
    for (const [i, answer] of this.#answers.entries()) {
      if (answer.skipped) continue;
      const type = this.#problems[i]?.type || "multiple-choice";
      if (!breakdown[type]) breakdown[type] = { correct: 0, total: 0 };
      breakdown[type].total++;
      if (answer.correct) breakdown[type].correct++;
    }
    for (const entry of Object.values(breakdown)) {
      entry.percentage =
        entry.total > 0 ? Math.round((entry.correct / entry.total) * 100) : 0;
    }
    return breakdown;
  }

  #computeTagBreakdown() {
    const breakdown = {};
    for (const [i, answer] of this.#answers.entries()) {
      if (answer.skipped) continue;
      const tags = this.#problems[i]?.tags || [];
      for (const tag of tags) {
        if (!breakdown[tag]) breakdown[tag] = { correct: 0, total: 0 };
        breakdown[tag].total++;
        if (answer.correct) breakdown[tag].correct++;
      }
    }
    for (const entry of Object.values(breakdown)) {
      entry.percentage =
        entry.total > 0 ? Math.round((entry.correct / entry.total) * 100) : 0;
    }
    return breakdown;
  }

  #complete() {
    const finalScore = this.score;
    const sessionSummary = this.getSessionSummary();
    this.#setState("complete");
    this.#emit("complete", {
      correct: finalScore.correct,
      total: finalScore.total,
      percentage: finalScore.percentage,
      answers: this.answers,
      sessionSummary,
    });
  }

  #buildSummaryResult(problem, answer) {
    if (!problem) {
      return {
        id: answer.problemId,
        type: "unknown",
        correct: answer.correct,
        tags: [],
        userAnswer: null,
        correctAnswer: null,
      };
    }

    const type = problem.type || "multiple-choice";
    const base = {
      id: answer.problemId,
      type,
      question: problem.question || "",
      correct: answer.correct,
      tags: problem.tags || [],
    };

    if (answer.skipped) {
      return { ...base, skipped: true, userAnswer: null, correctAnswer: null };
    }

    switch (type) {
      case "multiple-choice": // selected option index vs correct index
        return {
          ...base,
          userAnswer: answer.selected,
          correctAnswer: problem.correct,
        };
      case "numeric-input": // raw user value vs expected answer
        return {
          ...base,
          userAnswer: answer.userValue,
          correctAnswer: problem.answer,
        };
      case "ordering": // user's index sequence vs correct sequence
        return {
          ...base,
          userAnswer: [...answer.userOrder],
          correctAnswer: [...problem.correctOrder],
        };
      case "multi-select": // selected indices vs correct indices
        return {
          ...base,
          userAnswer: [...answer.selected],
          correctAnswer: [...problem.correctIndices],
        };
      case "two-stage": // per-stage selected/correct pairs
        return {
          ...base,
          userAnswer: answer.stageAnswers.map((stageAnswer) => ({
            selected: stageAnswer.selected,
            correct: stageAnswer.correct,
          })),
          correctAnswer: problem.stages.map((stage) => stage.correct),
        };
      default: // unknown type fallback
        return {
          ...base,
          userAnswer: null,
          correctAnswer: null,
        };
    }
  }
}
