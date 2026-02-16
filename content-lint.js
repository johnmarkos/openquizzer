#!/usr/bin/env node

/**
 * content-lint.js — Zero-dependency content quality linter for OpenQuizzer.
 *
 * Scans content/*.json for structural issues, duplicates, and suspicious text.
 *
 * Usage:
 *   node content-lint.js           # terminal summary
 *   node content-lint.js --json    # machine-readable JSON to stdout
 *
 * Exit codes:
 *   0 — no issues found
 *   1 — one or more issues found
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

// ── Configuration ──────────────────────────────────────────────────────────

const CONTENT_DIR = path.join(__dirname, "content");

/** Explanations appearing this many times or more are flagged. */
const REPEATED_EXPLANATION_THRESHOLD = 3;

/** Patterns that suggest incomplete or placeholder content. */
const SUSPICIOUS_PATTERNS = [
  /\/\/\s*\.\.\.\s*existing code/i,
  /TODO/,
  /FIXME/,
  /lorem ipsum/i,
  /placeholder/i,
  /\[insert .+\]/i,
  /TBD/,
];

// ── Issue Collector ────────────────────────────────────────────────────────

/**
 * @typedef {{ severity: 'error' | 'warning', file: string, problemId: string | null, check: string, message: string }} Issue
 */

/** @type {Issue[]} */
const issues = [];

function addIssue(severity, file, problemId, check, message) {
  issues.push({ severity, file, problemId, check, message });
}

// ── Structural Validation ──────────────────────────────────────────────────

/** Required top-level fields for every problem. */
const BASE_REQUIRED = ["id", "type", "question"];

/** Type-specific required fields. */
const TYPE_REQUIRED = {
  "multiple-choice": ["options", "correct", "explanation"],
  "numeric-input": ["answer", "explanation"],
  ordering: ["items", "correctOrder", "explanation"],
  "multi-select": ["options", "correctIndices", "explanation"],
  "two-stage": ["stages"],
};

const VALID_TYPES = Object.keys(TYPE_REQUIRED);

function validateStructure(problem, file) {
  const pid = problem.id || "(no id)";

  // Base fields
  for (const field of BASE_REQUIRED) {
    if (problem[field] === undefined || problem[field] === null) {
      addIssue(
        "error",
        file,
        pid,
        "structure",
        `Missing required field: ${field}`,
      );
    }
  }

  const type = problem.type;
  if (!type || !VALID_TYPES.includes(type)) {
    addIssue("error", file, pid, "structure", `Unknown problem type: ${type}`);
    return; // Can't do type-specific checks
  }

  for (const field of TYPE_REQUIRED[type]) {
    if (problem[field] === undefined || problem[field] === null) {
      addIssue(
        "error",
        file,
        pid,
        "structure",
        `Missing required field for ${type}: ${field}`,
      );
    }
  }

  // Type-specific bounds checks
  switch (type) {
    case "multiple-choice":
      if (
        Array.isArray(problem.options) &&
        typeof problem.correct === "number"
      ) {
        if (problem.correct < 0 || problem.correct >= problem.options.length) {
          addIssue(
            "error",
            file,
            pid,
            "structure",
            `correct index ${problem.correct} out of bounds (${problem.options.length} options)`,
          );
        }
      }
      break;

    case "ordering":
      if (Array.isArray(problem.items) && Array.isArray(problem.correctOrder)) {
        if (problem.correctOrder.length !== problem.items.length) {
          addIssue(
            "error",
            file,
            pid,
            "structure",
            `correctOrder length (${problem.correctOrder.length}) doesn't match items length (${problem.items.length})`,
          );
        }
      }
      break;

    case "multi-select":
      if (
        Array.isArray(problem.options) &&
        Array.isArray(problem.correctIndices)
      ) {
        for (const idx of problem.correctIndices) {
          if (idx < 0 || idx >= problem.options.length) {
            addIssue(
              "error",
              file,
              pid,
              "structure",
              `correctIndices value ${idx} out of bounds (${problem.options.length} options)`,
            );
          }
        }
      }
      break;

    case "two-stage":
      if (Array.isArray(problem.stages)) {
        if (problem.stages.length !== 2) {
          addIssue(
            "error",
            file,
            pid,
            "structure",
            `two-stage problem should have exactly 2 stages, found ${problem.stages.length}`,
          );
        }
        for (let i = 0; i < problem.stages.length; i++) {
          const stage = problem.stages[i];
          for (const field of [
            "question",
            "options",
            "correct",
            "explanation",
          ]) {
            if (stage[field] === undefined || stage[field] === null) {
              addIssue(
                "error",
                file,
                pid,
                "structure",
                `Stage ${i + 1} missing required field: ${field}`,
              );
            }
          }
          if (
            Array.isArray(stage.options) &&
            typeof stage.correct === "number" &&
            (stage.correct < 0 || stage.correct >= stage.options.length)
          ) {
            addIssue(
              "error",
              file,
              pid,
              "structure",
              `Stage ${i + 1} correct index ${stage.correct} out of bounds (${stage.options.length} options)`,
            );
          }
        }
      }
      break;
  }
}

// ── References Validation ──────────────────────────────────────────────────

function validateReferences(problem, file) {
  const pid = problem.id || "(no id)";

  const refSources = [];
  if (Array.isArray(problem.references)) {
    refSources.push({ refs: problem.references, label: "" });
  }
  if (Array.isArray(problem.stages)) {
    for (let i = 0; i < problem.stages.length; i++) {
      if (Array.isArray(problem.stages[i].references)) {
        refSources.push({
          refs: problem.stages[i].references,
          label: ` (stage ${i + 1})`,
        });
      }
    }
  }

  for (const { refs, label } of refSources) {
    for (let i = 0; i < refs.length; i++) {
      const ref = refs[i];
      if (!ref.title) {
        addIssue(
          "warning",
          file,
          pid,
          "references",
          `Reference ${i + 1}${label} missing title`,
        );
      }
      if (!ref.url) {
        addIssue(
          "error",
          file,
          pid,
          "references",
          `Reference ${i + 1}${label} missing url`,
        );
      } else if (
        !ref.url.startsWith("http://") &&
        !ref.url.startsWith("https://")
      ) {
        addIssue(
          "warning",
          file,
          pid,
          "references",
          `Reference ${i + 1}${label} url doesn't start with http: "${ref.url}"`,
        );
      }
    }
  }
}

// ── Suspicious Text ────────────────────────────────────────────────────────

function checkSuspiciousText(problem, file) {
  const pid = problem.id || "(no id)";

  // Collect all text fields to scan
  const texts = [];
  if (problem.question) texts.push(problem.question);
  if (problem.explanation) texts.push(problem.explanation);
  if (problem.detailedExplanation) texts.push(problem.detailedExplanation);
  if (Array.isArray(problem.options)) texts.push(...problem.options);
  if (Array.isArray(problem.items)) texts.push(...problem.items);
  if (Array.isArray(problem.stages)) {
    for (const stage of problem.stages) {
      if (stage.question) texts.push(stage.question);
      if (stage.explanation) texts.push(stage.explanation);
      if (stage.detailedExplanation) texts.push(stage.detailedExplanation);
      if (Array.isArray(stage.options)) texts.push(...stage.options);
    }
  }

  const combined = texts.join("\n");
  for (const pattern of SUSPICIOUS_PATTERNS) {
    const match = combined.match(pattern);
    if (match) {
      addIssue(
        "warning",
        file,
        pid,
        "suspicious-text",
        `Suspicious text found: "${match[0]}"`,
      );
    }
  }
}

// ── Cross-Problem Checks ──────────────────────────────────────────────────

function checkSingleCorrectMultiSelect(problem, file) {
  if (
    problem.type === "multi-select" &&
    Array.isArray(problem.correctIndices) &&
    problem.correctIndices.length === 1
  ) {
    addIssue(
      "warning",
      file,
      problem.id || "(no id)",
      "single-correct-multi-select",
      "Multi-select has only 1 correct answer — consider using multiple-choice instead",
    );
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

function loadContentFiles() {
  if (!fs.existsSync(CONTENT_DIR)) {
    console.error(`Content directory not found: ${CONTENT_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();

  if (files.length === 0) {
    console.error(`No JSON files found in ${CONTENT_DIR}`);
    process.exit(1);
  }

  /** @type {Map<string, { chapterTitle: string, problems: object[] }>} */
  const chapters = new Map();

  for (const file of files) {
    const filePath = path.join(CONTENT_DIR, file);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch (e) {
      addIssue(
        "error",
        file,
        null,
        "parse",
        `Failed to parse JSON: ${e.message}`,
      );
      continue;
    }

    if (!Array.isArray(data.problems)) {
      addIssue(
        "error",
        file,
        null,
        "structure",
        'Missing or invalid "problems" array',
      );
      continue;
    }

    chapters.set(file, data);
  }

  return chapters;
}

function runChecks(chapters) {
  // Global trackers for cross-chapter checks
  /** @type {Map<string, string[]>} id → [files] */
  const globalIds = new Map();
  /** @type {Map<string, string[]>} normalized stem → [file:id] */
  const globalStems = new Map();
  /** @type {Map<string, string[]>} explanation → [file:id] */
  const explanationCounts = new Map();

  for (const [file, data] of chapters) {
    /** @type {Set<string>} */
    const chapterIds = new Set();
    /** @type {Map<string, string>} normalized stem → id */
    const chapterStems = new Map();

    for (const problem of data.problems) {
      const pid = problem.id || "(no id)";

      // ── Per-problem checks ──
      validateStructure(problem, file);
      validateReferences(problem, file);
      checkSuspiciousText(problem, file);
      checkSingleCorrectMultiSelect(problem, file);

      // ── Duplicate IDs within chapter ──
      if (problem.id) {
        if (chapterIds.has(problem.id)) {
          addIssue(
            "error",
            file,
            pid,
            "duplicate-id",
            `Duplicate problem ID within chapter: "${problem.id}"`,
          );
        }
        chapterIds.add(problem.id);

        // Track for cross-chapter check
        if (!globalIds.has(problem.id)) globalIds.set(problem.id, []);
        globalIds.get(problem.id).push(file);
      }

      // ── Duplicate stems ──
      if (problem.question) {
        const normalized = problem.question.trim().toLowerCase();
        if (chapterStems.has(normalized)) {
          addIssue(
            "warning",
            file,
            pid,
            "duplicate-stem",
            `Duplicate question stem within chapter (also in "${chapterStems.get(normalized)}")`,
          );
        }
        chapterStems.set(normalized, pid);

        // Track for cross-chapter check
        if (!globalStems.has(normalized)) globalStems.set(normalized, []);
        globalStems.get(normalized).push(`${file}:${pid}`);
      }

      // ── Collect explanations for dedup ──
      const explanations = [];
      if (problem.explanation) explanations.push(problem.explanation);
      if (Array.isArray(problem.stages)) {
        for (const stage of problem.stages) {
          if (stage.explanation) explanations.push(stage.explanation);
        }
      }
      for (const exp of explanations) {
        if (!explanationCounts.has(exp)) explanationCounts.set(exp, []);
        explanationCounts.get(exp).push(`${file}:${pid}`);
      }
    }
  }

  // ── Cross-chapter duplicate IDs ──
  for (const [id, files] of globalIds) {
    if (files.length > 1) {
      addIssue(
        "error",
        files[0],
        id,
        "duplicate-id-cross",
        `Problem ID "${id}" appears in multiple files: ${files.join(", ")}`,
      );
    }
  }

  // ── Cross-chapter duplicate stems ──
  for (const [, locations] of globalStems) {
    if (locations.length > 1) {
      // Only flag if they're in different files
      const files = locations.map((loc) => loc.split(":")[0]);
      const uniqueFiles = new Set(files);
      if (uniqueFiles.size > 1) {
        addIssue(
          "warning",
          [...uniqueFiles][0],
          null,
          "duplicate-stem-cross",
          `Same question stem appears across files: ${locations.join(", ")}`,
        );
      }
    }
  }

  // ── Repeated explanations ──
  for (const [explanation, locations] of explanationCounts) {
    if (locations.length >= REPEATED_EXPLANATION_THRESHOLD) {
      const truncated =
        explanation.length > 60
          ? explanation.slice(0, 60) + "..."
          : explanation;
      addIssue(
        "warning",
        locations[0].split(":")[0],
        null,
        "repeated-explanation",
        `Explanation appears ${locations.length} times: "${truncated}" — in ${locations.join(", ")}`,
      );
    }
  }
}

// ── Output ─────────────────────────────────────────────────────────────────

function outputJson() {
  const result = {
    totalIssues: issues.length,
    errors: issues.filter((i) => i.severity === "error").length,
    warnings: issues.filter((i) => i.severity === "warning").length,
    issues,
  };
  console.log(JSON.stringify(result, null, 2));
}

function outputTerminal() {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  if (issues.length === 0) {
    console.log("Content lint: all clear!");
    return;
  }

  // Summary counts
  console.log(
    `\nContent lint: ${errors.length} error(s), ${warnings.length} warning(s)\n`,
  );

  // Group by file
  /** @type {Map<string, Issue[]>} */
  const byFile = new Map();
  for (const issue of issues) {
    if (!byFile.has(issue.file)) byFile.set(issue.file, []);
    byFile.get(issue.file).push(issue);
  }

  for (const [file, fileIssues] of byFile) {
    console.log(`── ${file} ──`);
    for (const issue of fileIssues) {
      const prefix = issue.severity === "error" ? "ERROR" : "WARN ";
      const id = issue.problemId ? ` [${issue.problemId}]` : "";
      console.log(`  ${prefix}${id} (${issue.check}) ${issue.message}`);
    }
    console.log("");
  }
}

// ── Entry Point ────────────────────────────────────────────────────────────

const jsonMode = process.argv.includes("--json");

const chapters = loadContentFiles();
runChecks(chapters);

if (jsonMode) {
  outputJson();
} else {
  outputTerminal();
}

process.exit(issues.length > 0 ? 1 : 0);
