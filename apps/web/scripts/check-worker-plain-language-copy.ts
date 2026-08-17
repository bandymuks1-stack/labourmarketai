#!/usr/bin/env tsx
// Worker plain-language copy guard (low-cognitive-load-guidelines-v1 §3/§8).
//
// Fails if implementation / AI-internals wording leaks into the WORKER-FACING
// i18n strings. Ordinary workers (construction, factory, driver, welder,
// cleaner, warehouse, electrician) must never see database or AI-pipeline
// vocabulary. Those words may exist internally and in admin/superadmin
// surfaces — those namespaces are excluded below.
//
// Scope: the two PRIMARY worker locales (en, lt) — the base catalog plus the
// worker-facing UI-copy sub-namespaces (journal, labourMarket). Pure
// domain-term catalogs (skill/profession/unit names) are excluded. Narrow,
// high-signal patterns only (mirrors the pilot-honesty guard) so it catches
// real regressions without false positives.
//
//   pnpm -F web check:worker-plain-language
//
// No network, no env, no DB.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "..");
const messagesDir = join(webRoot, "messages");

// Locales enforced strictly. en + lt are the primary worker locales the
// product ships on first; other locales are cleaned in lockstep but not gated
// here (they carry translation debt tracked separately by check:i18n-debt).
const LOCALES = ["en", "lt"] as const;

// Top-level namespaces that are admin / superadmin / owner / internal — a
// worker never sees these, so technical vocabulary there is legitimate.
const EXCLUDED_NAMESPACES = new Set<string>([
  "admin",
  "adminReadiness",
  "adminBilling",
  "adminLaunchReadiness",
  "adminPilots",
  "intelligence",
  "telemetry",
  "agentOs",
  "billingTest",
  "needStructuring",
  "marketRecognition",
  "reports",
  // Company / employer / billing surfaces — sophisticated business users, not
  // the low-literacy worker spine. "pipeline" is ordinary sales vocabulary
  // here; the ISO-code hint lives on the employer posting-authoring form.
  "crmPipeline",
  "salesIntake",
  "planBoundary",
  "jobPostings",
  "billingStatus",
  "adminReadiness",
  // Org document register — owner/admin governance surface (document
  // "classification" is the register's own legal vocabulary, and the
  // reader is an employer, not the low-literacy worker spine). The
  // worker-facing half of the document engine lives in `documentFiles`,
  // which IS scanned.
  "orgDocuments",
]);

type Rule = { name: string; rx: RegExp };

// Each pattern is worker-hostile wherever it appears in a normal worker flow.
const RULES: Rule[] = [
  { name: "AI/KI/DI acronym tag", rx: /\((?:AI|KI|DI)\)/ },
  { name: "classify/classified/classification", rx: /\bclassif(?:y|ied|ication)\b/i },
  { name: "provenance", rx: /\bprovenance\b/i },
  { name: "parser/parsing", rx: /\bpars(?:er|ing)\b/i },
  { name: "extraction", rx: /\bextraction\b/i },
  { name: "pipeline", rx: /\bpipeline\b/i },
  { name: "normalized/normalised/normalizuota", rx: /\bnormali[sz](?:ed|ation)\b|\bnormalizuot\w*/i },
  { name: "confidence score/threshold", rx: /\bconfidence\s+(?:score|threshold|bin)\b/i },
  { name: "taxonomy", rx: /\btaxonomy\b/i },
  { name: "provenance hash", rx: /\bhash\b/i },
  { name: "Detected CV/skills/entries", rx: /\bdetected\s+(?:cv|skills?|entries|sections?)\b/i },
  { name: "two-letter codes", rx: /\btwo-letter code/i },
  { name: "raw schema/registry/RPC/RLS token", rx: /\b(?:RPC|RLS)\b/ },
];

type Hit = { file: string; keyPath: string; text: string; rule: string };

function walk(
  node: unknown,
  path: string[],
  onLeaf: (keyPath: string, value: string) => void,
): void {
  if (typeof node === "string") {
    onLeaf(path.join("."), node);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => walk(v, [...path, String(i)], onLeaf));
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      walk(v, [...path, k], onLeaf);
    }
  }
}

const hits: Hit[] = [];

// Worker-facing UI-copy namespace files under messages/{locale}/. The pure
// DOMAIN-TERM catalogs (skill-names, professions, relationship-types,
// productivity-units) are deliberately NOT scanned: words like "extraction"
// or "assembly" are legitimate job/skill names there, not implementation
// leaks, and scanning them would produce false positives.
const UI_SUBDIR_FILES: { file: string; ns: string }[] = [
  { file: "journal.json", ns: "journal" },
  { file: "labour-market.json", ns: "labourMarket" },
];

for (const locale of LOCALES) {
  const sources: { file: string; json: unknown; nsPrefix: string | null }[] = [
    {
      file: `messages/${locale}.json`,
      json: JSON.parse(readFileSync(join(messagesDir, `${locale}.json`), "utf8")),
      nsPrefix: null,
    },
    ...UI_SUBDIR_FILES.map(({ file, ns }) => ({
      file: `messages/${locale}/${file}`,
      json: JSON.parse(readFileSync(join(messagesDir, locale, file), "utf8")),
      nsPrefix: ns,
    })),
  ];

  for (const { file, json, nsPrefix } of sources) {
    walk(json, [], (keyPath, value) => {
      const topNs = nsPrefix ?? keyPath.split(".")[0];
      if (EXCLUDED_NAMESPACES.has(topNs)) return;
      for (const { name, rx } of RULES) {
        rx.lastIndex = 0;
        if (rx.test(value)) {
          hits.push({
            file,
            keyPath: nsPrefix ? `${nsPrefix}.${keyPath}` : keyPath,
            text: value,
            rule: name,
          });
        }
      }
    });
  }
}

if (hits.length) {
  process.stderr.write(
    "\nWorker plain-language copy guard — implementation wording leaked to workers:\n\n",
  );
  for (const h of hits) {
    process.stderr.write(`  ${h.file}  [${h.rule}]\n`);
    process.stderr.write(`    ${h.keyPath} = ${JSON.stringify(h.text)}\n`);
  }
  process.stderr.write(
    `\n${hits.length} leak(s). Rewrite in plain worker language — see docs/launch/low-cognitive-load-guidelines-v1.md §3.\n`,
  );
  process.exit(1);
}

process.stdout.write("Worker plain-language copy guard: PASS (en, lt)\n");
