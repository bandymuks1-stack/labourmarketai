#!/usr/bin/env tsx
// Work Journal recognition — unknown-phrase inventory (Layer F, read-only).
//
// Runs the deterministic recognizer over a corpus of worker phrases and writes
// an owner-facing inventory under the gitignored runtime/ tree:
//
//   runtime/project-quality/recognition-unknown-inventory.md
//   runtime/project-quality/recognition-unknown-inventory.json
//
// Corpus = a built-in sample (the recognition acceptance examples) PLUS, if
// present, one phrase per line from:
//
//   runtime/recognition-unknown-input.txt
//
// That file is where production `journal_entry_metrics` `unknown_phrase` rows
// can be exported for analysis. NO DB access, NO network, NO migration — this
// only reads files + writes the report (owner Q4: script/report, not admin UI).
//
//   pnpm -F web recognition:unknown-report

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { summarizeRecognition } from "../lib/structuring/unknown-report";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "..");
const repoRoot = resolve(here, "..", "..", "..");
const outDir = resolve(repoRoot, "runtime", "project-quality");
const inputFile = resolve(repoRoot, "runtime", "recognition-unknown-input.txt");

// Built-in acceptance sample (LT incl. missing diacritics, RU, EN, weak/unknown).
const SAMPLE: string[] = [
  "montavau langus 6 val",
  "dazem sienas",
  "liejau betona, klojiniai, armatura",
  "gipsas lubos",
  "plyteles vonioj",
  "tinkavau",
  "murijau siena",
  "stoga dengiau",
  "suvirinau remus",
  "kasiau transeja",
  "klijavau tapetus",
  "elektros instaliacija",
  "dažymas",
  "gipsa",
  "клал плитку в ванной",
  "штукатурил стены",
  "заливал бетон",
  "вязал арматуру",
  "ставил окна",
  "монтаж гипсокартона",
  "копал траншею",
  "красил стены, 3 часа",
  "window install, 4h",
  "painted walls",
  "laid tiles in bathroom",
  "rebar and formwork",
  "montavau",
  "darbas buvo geras",
  "сегодня устал",
];

function loadInputPhrases(): string[] {
  if (!existsSync(inputFile)) return [];
  return readFileSync(inputFile, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}

function main(): number {
  const extra = loadInputPhrases();
  const phrases = [...SAMPLE, ...extra];
  const report = summarizeRecognition(phrases);

  const md = `# Work Journal Recognition — Unknown-Phrase Inventory

> Read-only deterministic report (no DB, no AI). Source: built-in sample (${SAMPLE.length})${
    extra.length ? ` + runtime/recognition-unknown-input.txt (${extra.length})` : ""
  }.

## Summary

| Bucket | Count |
|---|---|
| Recognized (high/medium) | ${report.recognized} |
| Weak (low — manual-pick path) | ${report.weak} |
| Unknown (no match → improve dictionary) | ${report.unknown} |
| **Total** | ${report.total} |

## Unknown phrases (dictionary-improvement list, by frequency)

${
  report.unknownByFrequency.length === 0
    ? "_None — every phrase produced at least a weak suggestion._"
    : "| Phrase | Count |\n|---|---|\n" +
      report.unknownByFrequency
        .map((u) => `| ${u.phrase.replace(/\|/g, "\\|")} | ${u.count} |`)
        .join("\n")
}

## Weak matches (shown with manual-pick path)

${
  report.outcomes.filter((o) => o.bucket === "weak").length === 0
    ? "_None._"
    : "| Phrase | Suggested slug(s) |\n|---|---|\n" +
      report.outcomes
        .filter((o) => o.bucket === "weak")
        .map((o) => `| ${o.phrase.replace(/\|/g, "\\|")} | ${o.slugs.join(", ")} |`)
        .join("\n")
}

> To analyse real production gaps, export \`journal_entry_metrics\` rows with
> \`metric_slug = 'unknown_phrase'\` (their \`metric_value\`/phrase text) into
> \`runtime/recognition-unknown-input.txt\` (one phrase per line) and re-run.
`;

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "recognition-unknown-inventory.md"), md, "utf8");
  writeFileSync(
    resolve(outDir, "recognition-unknown-inventory.json"),
    JSON.stringify(report, null, 2),
    "utf8",
  );

  // eslint-disable-next-line no-console
  console.log(
    `recognition:unknown-report OK — ${report.recognized} recognized, ${report.weak} weak, ${report.unknown} unknown of ${report.total}. Report: runtime/project-quality/`,
  );
  return 0;
}

process.exit(main());
