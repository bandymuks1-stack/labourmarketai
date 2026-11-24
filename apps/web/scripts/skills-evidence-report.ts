#!/usr/bin/env tsx
// Universal skills — evidence-state inventory (read-only, DRY-RUN by default).
//
// Reports how worker skills break down across the honest evidence states
// (verified / manager_confirmed / work_supported / self_declared /
// unclassified) so old / unclassified entries are VISIBLE and can be queued
// for review. It NEVER writes to the database and NEVER overwrites any skill
// state — it only reads an optional exported file + writes a report under the
// gitignored runtime/ tree:
//
//   runtime/project-quality/skills-evidence-inventory.md
//   runtime/project-quality/skills-evidence-inventory.json
//
// Input (optional): one JSON array of skill rows at
//   runtime/skills-evidence-input.json
// where each row is { source?, verified?, journalSupported?, classified? }.
// Production `worker_skills` rows can be exported there for analysis. When the
// file is absent a built-in sample is used so the report always produces output.
//
// NO DB access, NO network, NO migration. Dry-run is the ONLY mode.
//
//   pnpm -F web skills:evidence-report

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  aggregateSkillEvidenceStates,
  hasUnreviewedSkills,
  type SkillEvidenceStateInput,
} from "../lib/profile/skill-evidence-state";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const outDir = resolve(repoRoot, "runtime", "project-quality");
const inputFile = resolve(repoRoot, "runtime", "skills-evidence-input.json");

// Built-in sample (covers every state incl. unclassified) so the report runs
// with no input file present.
const SAMPLE: SkillEvidenceStateInput[] = [
  { verified: true },
  { source: "manager_confirmed" },
  { source: "work_journal" },
  { journalSupported: true },
  { source: "self_declared" },
  { source: "self_declared" },
  { classified: false },
];

function loadRows(): { rows: SkillEvidenceStateInput[]; usedSample: boolean } {
  if (existsSync(inputFile)) {
    try {
      const parsed = JSON.parse(readFileSync(inputFile, "utf8"));
      if (Array.isArray(parsed)) {
        return { rows: parsed as SkillEvidenceStateInput[], usedSample: false };
      }
      console.warn("skills-evidence-input.json is not a JSON array; using sample.");
    } catch (e) {
      console.warn(`Could not parse ${inputFile}; using sample.`, e);
    }
  }
  return { rows: SAMPLE, usedSample: true };
}

const { rows, usedSample } = loadRows();
const breakdown = aggregateSkillEvidenceStates(rows);
const total = rows.length;
const needsReview = hasUnreviewedSkills(breakdown);

const lines = [
  "# Skills evidence inventory (DRY-RUN, read-only)",
  "",
  `Source: ${usedSample ? "built-in sample (no runtime/skills-evidence-input.json)" : inputFile}`,
  `Total skills: ${total}`,
  "",
  "| State | Count |",
  "|---|---|",
  `| verified | ${breakdown.verified} |`,
  `| manager_confirmed | ${breakdown.manager_confirmed} |`,
  `| work_supported | ${breakdown.work_supported} |`,
  `| self_declared | ${breakdown.self_declared} |`,
  `| unclassified (needs review) | ${breakdown.unclassified} |`,
  "",
  needsReview
    ? `⚠ ${breakdown.self_declared + breakdown.unclassified} skill(s) still need review (self-declared or unclassified). This report NEVER changes any state — confirmation stays a real human action.`
    : "All skills are supported or verified.",
  "",
];

mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "skills-evidence-inventory.md"), lines.join("\n"));
writeFileSync(
  resolve(outDir, "skills-evidence-inventory.json"),
  JSON.stringify({ total, breakdown, needsReview, usedSample }, null, 2),
);

console.log(lines.join("\n"));
console.log(`Report written to ${outDir} (dry-run; no DB writes).`);
