import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Constitution compliance guard (P0, 2026-05-28).
 *
 * Pins the three codified policies introduced in PR #96 (constitution
 * enforcement) plus the constitution amendment cross-references and
 * the account-and-role-model self-entry insertion. The test fails if
 * any pinned file is deleted, renamed, or has its required phrase
 * silently stripped.
 *
 * The CLI script `pnpm -F web check:constitution` runs the same
 * probes via `apps/web/scripts/check-constitution.ts`; this test
 * keeps the regression caught by `pnpm -F web test` as well.
 */

const repoRoot = resolve(__dirname, "..", "..", "..", "..");

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

describe("constitution compliance guard", () => {
  for (const probe of PROBES) {
    describe(probe.file, () => {
      it("exists on disk", () => {
        const abs = resolve(repoRoot, probe.file);
        expect(existsSync(abs)).toBe(true);
      });

      for (const phrase of probe.phrases) {
        it(`contains phrase: ${JSON.stringify(phrase).slice(0, 90)}`, () => {
          const abs = resolve(repoRoot, probe.file);
          const body = readFileSync(abs, "utf-8");
          expect(body.includes(phrase)).toBe(true);
        });
      }
    });
  }
});
