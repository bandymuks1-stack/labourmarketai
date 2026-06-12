/**
 * Governance guard (DI decision 2026-06-12) — conditional prod-apply autonomy.
 *
 * The trade: agents may self-apply GREEN migrations to prod, in exchange for
 * THREE hard safeties. Per doctrine-guard §7, those safeties live as CI, not
 * prose — this guard pins them so neither the classifier nor the contract can
 * silently regress:
 *   1. migration-safety carries the upgraded RED detectors it MISSED on #322,
 *      fails closed on unrecognized DDL, and enforces the .down.sql file rule.
 *   2. the migration-safety self-test contains the canonical RED (#322) and
 *      GREEN (#321) fixtures named in the decision, and passes.
 *   3. doctrine-guard SKILL.md §4 + AGENTS.md state the conditional rule with
 *      all five preconditions, and the applied ru migration has its rollback.
 */

import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO = resolve(__dirname, "..", "..", "..", "..");
const read = (rel: string): string => readFileSync(resolve(REPO, rel), "utf8");

const SAFETY = read(".github/scripts/migration-safety.mjs");
const SKILL = read(".claude/skills/doctrine-guard/SKILL.md");
const AGENTS = read("AGENTS.md");

describe("governance: migration-safety carries the upgraded RED detectors", () => {
  // The classifier is the load-bearing control. Each id below MUST be a
  // detector in the script (the class that, missing, lets a RED migration
  // self-apply to prod).
  const REQUIRED_RISK_IDS = [
    "security-definer-function",
    "grant-or-revoke",
    "alter-owner",
    "alter-drop-policy",
    "set-role",
    "set-not-null",
    "drop-not-null",
    "drop-constraint-bare",
    "data-dml",
    "disable-rls",
    "alter-default-privileges",
    "truncate",
    "create-extension",
    "create-trigger",
    "alter-type",
    "unrecognized-ddl",
    "missing-rollback-file",
  ];
  for (const id of REQUIRED_RISK_IDS) {
    it(`detects "${id}"`, () => {
      expect(SAFETY, `migration-safety must emit the "${id}" finding`).toContain(`"${id}"`);
    });
  }

  it("fails closed: unrecognized statement shapes are RED by default", () => {
    expect(SAFETY).toMatch(/ALLOWED_LEADS/);
    expect(SAFETY).toMatch(/unrecognized-ddl/);
    // dollar bodies + string literals are stripped before statement splitting
    expect(SAFETY).toMatch(/stripBodiesAndStrings/);
  });

  it("the SECURITY DEFINER detector regex covers the CREATE OR REPLACE swap", () => {
    // assert the detector source fragments are present (the file literally
    // contains these regex pieces)
    expect(SAFETY).toContain("create\\s+(or\\s+replace\\s+)?function");
    expect(SAFETY).toContain("security\\s+definer");
  });

  it("the .down.sql rule is a STRUCTURAL (non-bypassable) check", () => {
    // structural(), not risk() — a human-gate annotation cannot excuse a
    // missing rollback file.
    expect(SAFETY).toMatch(/structural\(\s*[\r\n]?\s*"missing-rollback-file"/);
  });
});

describe("governance: migration-safety self-test passes with the canonical fixtures", () => {
  it("contains the canonical RED (#322) and GREEN (#321) fixtures", () => {
    expect(SAFETY).toMatch(/CANONICAL GREEN: PR #321/);
    expect(SAFETY).toMatch(/CANONICAL RED: PR #322/);
  });

  it("`node migration-safety.mjs --self-test` exits 0", () => {
    // Runs the same self-test CI runs. Throws (fails the test) on non-zero.
    const out = execFileSync(
      "node",
      [resolve(REPO, ".github/scripts/migration-safety.mjs"), "--self-test"],
      { encoding: "utf8" },
    );
    expect(out).toMatch(/self-test: \d+ passed, 0 failed/);
  });
});

describe("governance: the conditional prod-apply rule lives in the contract", () => {
  it("SKILL.md §4 states conditional autonomy with all five preconditions", () => {
    expect(SKILL).toMatch(/PROD APPLY AUTONOMY \(conditional\)/);
    expect(SKILL).toMatch(/classified \*\*GREEN\*\*/);
    expect(SKILL).toMatch(/strictly \*\*additive\/widening\*\*/);
    expect(SKILL).toMatch(/supabase\/rollbacks\/<same_name>\.down\.sql/);
    expect(SKILL).toMatch(/verify the change on prod via an MCP\s+read query/i);
    expect(SKILL).toMatch(/APPLIED TO PROD: <name> \(rollback: <file>\)/);
    expect(SKILL).toMatch(/never reason your way\s+from RED to GREEN/i);
  });

  it("AGENTS.md replaces the old hard blocker with the conditional rule + RED-absolute", () => {
    expect(AGENTS).toMatch(/PROD APPLY AUTONOMY \(conditional/);
    expect(AGENTS).toMatch(/RED remains absolute/i);
    // the old unconditional blocker text must be gone
    expect(AGENTS).not.toMatch(/Running migrations on production — \*\*NEVER automatic/);
  });
});

describe("governance: rollback backfill", () => {
  it("the self-applied ru widening has its .down.sql", () => {
    expect(
      existsSync(
        resolve(REPO, "supabase/rollbacks/20260612130000_widen_original_language_ru.down.sql"),
      ),
      "the ru-locale widening was applied to prod and must have a paired rollback",
    ).toBe(true);
  });
});
