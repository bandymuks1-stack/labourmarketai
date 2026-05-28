#!/usr/bin/env tsx
// Constitution compliance guard (P0, 2026-05-28).
//
// Pins the three codified policies introduced in the constitution-
// enforcement PR plus the three cross-reference points the
// constitution amendment relies on. Each pinned file MUST exist on
// disk AND carry the listed phrases verbatim. Any drift or deletion
// fails this guard with a non-zero exit code, blocking the PR.
//
// Run from the web workspace:
//   pnpm -F web check:constitution
//
// Scope is intentionally narrow — verify-only:
//   - three new docs/policies/*-v1.md files exist;
//   - each carries the phrase set that makes it usable;
//   - docs/PRODUCT_CONSTITUTION.md §11 references each new file;
//   - docs/policies/account-and-role-model-v1.md surfaces the
//     self-entry-default + invitation-additional rule.
//
// No network, no filesystem writes, no env reads.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// scripts lives under apps/web/scripts → repo root is three levels up
const repoRoot = resolve(here, "..", "..", "..");

interface Probe {
  readonly file: string;
  readonly phrases: readonly string[];
}

const PROBES: readonly Probe[] = [
  {
    file: "docs/policies/onboarding-channels-policy-v1.md",
    phrases: [
      "self-entry is the default",
      "Invitations are an ADDITIONAL channel",
      "Both channels write to the same",
      "Designing the product as invite-only at any layer",
    ],
  },
  {
    file: "docs/policies/feature-definition-of-done-v1.md",
    phrases: [
      "BEFORE",
      "AFTER",
      "URL",
      "ACTION",
      "RESULT",
      "RELOAD",
      "BLOCKER",
      "A preview is not a completed feature",
      "Progression-advance gate",
    ],
  },
  {
    file: "docs/policies/constitution-compliance-checklist-v1.md",
    phrases: [
      "Constitution compliance",
      "Self-entry path open and reachable",
      "BEFORE answered literally",
      "Progression state (real / partial / blocked / preview) declared",
      "Constitution audit trail",
    ],
  },
  {
    file: "docs/policies/account-and-role-model-v1.md",
    phrases: [
      "Self-entry is the default channel",
      "Invitations are an **additional** channel",
      "Each role has responsibilities, permissions, visibility, and limits",
    ],
  },
  {
    file: "docs/PRODUCT_CONSTITUTION.md",
    phrases: [
      "11. Onboarding channels and Definition of Done",
      "docs/policies/onboarding-channels-policy-v1.md",
      "docs/policies/feature-definition-of-done-v1.md",
      "docs/policies/constitution-compliance-checklist-v1.md",
      "BEFORE / AFTER / URL / ACTION /",
      "real / partial / blocked / preview",
    ],
  },
];

interface ProbeResult {
  readonly file: string;
  readonly missingFile: boolean;
  readonly missingPhrases: readonly string[];
}

function evaluateProbe(probe: Probe): ProbeResult {
  const abs = resolve(repoRoot, probe.file);
  if (!existsSync(abs)) {
    return {
      file: probe.file,
      missingFile: true,
      missingPhrases: probe.phrases,
    };
  }
  const body = readFileSync(abs, "utf-8");
  const missingPhrases = probe.phrases.filter((p) => !body.includes(p));
  return { file: probe.file, missingFile: false, missingPhrases };
}

function main(): number {
  const results = PROBES.map(evaluateProbe);
  const failures = results.filter(
    (r) => r.missingFile || r.missingPhrases.length > 0,
  );
  if (failures.length === 0) {
    // eslint-disable-next-line no-console
    console.log(
      `check:constitution OK — ${PROBES.length} probe(s) pass, all pinned phrases present.`,
    );
    return 0;
  }
  // eslint-disable-next-line no-console
  console.error(
    `check:constitution FAILED — ${failures.length} probe(s) had drift:`,
  );
  for (const r of failures) {
    if (r.missingFile) {
      // eslint-disable-next-line no-console
      console.error(`  - ${r.file}: file does not exist`);
      continue;
    }
    // eslint-disable-next-line no-console
    console.error(`  - ${r.file}: missing ${r.missingPhrases.length} phrase(s):`);
    for (const p of r.missingPhrases) {
      // eslint-disable-next-line no-console
      console.error(`      · ${JSON.stringify(p)}`);
    }
  }
  return 1;
}

process.exit(main());
