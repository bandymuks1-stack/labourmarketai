import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

/**
 * A source comment must not claim a migration is unapplied when production
 * has applied it.
 *
 * `lib/worker/worker-education.ts` records what this costs: its header said
 * "DRAFT … NOT applied yet" for seven weeks after the migration shipped, "and
 * that sentence is why the capability kept being re-reported as missing". On
 * 2026-09-14 ten of its siblings were still saying it, along with the document
 * action, the pilot cohort, the agency↔client bridge and the S5 pool — while
 * `worker_languages` held 13 rows, `worker_education` 4 and
 * `worker_achievements` 2.
 *
 * This guard is static: it pins the corrected files against the one phrase
 * that caused the rot, and pins the SHORT LIST of things that really are
 * absent from production so the next reader checks the database rather than a
 * comment. It does not connect to any database.
 */
const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

/** Verified absent from production 2026-09-14. Everything else a module
 *  claims is "not applied yet" needs re-checking before it is believed. */
const GENUINELY_ABSENT = [
  "agency_clients",
  "journal_profession_templates",
  "worker_external_profiles",
  "worker_opportunity_seen",
  "assistant_conversations",
  "assistant_messages",
] as const;

/** Corrected on 2026-09-14 — production has these. */
const CORRECTED = [
  "lib/worker/availability-prefs.ts",
  "lib/worker/availability-prefs-actions.ts",
  "lib/worker/availability-prefs-model.ts",
  "lib/worker/worker-languages.ts",
  "lib/worker/worker-languages-actions.ts",
  "lib/worker/worker-languages-model.ts",
  "lib/worker/worker-education-model.ts",
  "lib/worker/worker-education-actions.ts",
  "lib/worker/worker-achievements-model.ts",
  "lib/worker/worker-achievements-actions.ts",
  "lib/documents/document-actions.ts",
  "lib/admin/pilot-actions.ts",
  "lib/agency/bridge-read.ts",
  "lib/agency/bridge-actions.ts",
  "lib/agency/pool.ts",
  "app/[locale]/dashboard/admin/pilots/page.tsx",
] as const;

/** The phrase that rotted: an unqualified present-tense "not applied yet". */
const ROT = /NOT applied yet|not applied yet\)|\(production today\)/i;

describe("1. the corrected headers do not say it again", () => {
  for (const f of CORRECTED) {
    it(`${f} makes no unqualified "not applied yet" claim`, () => {
      expect(read(f)).not.toMatch(ROT);
    });
  }
});

describe("2. each correction carries its evidence", () => {
  for (const f of CORRECTED) {
    it(`${f} states production has it, and dates the check`, () => {
      const src = read(f);
      // "applied" or "present" — the wording differs per module (a table is
      // present, a migration is applied); what must not differ is that the
      // claim is affirmative and carries the date it was checked.
      expect(src).toMatch(/applied|present/i);
      // Either the date the database was read, or the ledger version that
      // proves the apply — both are checkable; a bare assertion is not.
      expect(src).toMatch(/2026-09-14|ledger `\d{14}`/);
    });
  }
});

describe("3. the degradation branches are KEPT", () => {
  // Correcting the claim must never delete the honest fallback: a fresh or
  // local database still has to explain itself instead of crashing.
  const withFallback: readonly [string, RegExp][] = [
    ["lib/worker/worker-languages.ts", /needs-migration|42P01/],
    ["lib/worker/availability-prefs.ts", /not-enabled|42703/],
    ["lib/documents/document-actions.ts", /needs_migration/],
    ["lib/admin/pilot-actions.ts", /needs_migration|42883/],
    ["lib/agency/bridge-read.ts", /needs-migration/],
    ["lib/agency/pool.ts", /needs-gate|needs-migration/],
  ];
  for (const [f, re] of withFallback) {
    it(`${f} still degrades`, () => {
      expect(read(f)).toMatch(re);
    });
  }
});

describe("4. what really is absent stays a short, named list", () => {
  it("the drift report names the assistant pair as the eighth prepared capability", () => {
    const drift = readFileSync(
      join(APP, "..", "..", "docs/launch/SCHEMA_DRIFT_REPO_VS_PRODUCTION_2026-09-14.md"),
      "utf8",
    );
    for (const name of GENUINELY_ABSENT) expect(drift).toContain(name);
    expect(drift).toMatch(/EIGHTH prepared capability/i);
    expect(drift).toMatch(/apply status belongs to the\s*\n?\s*database, not to a comment/i);
  });

  it("the assistant migration is deliberately NOT in supabase/migrations", () => {
    const listed = execSync("git ls-files supabase/migrations", {
      cwd: join(APP, "..", ".."),
      encoding: "utf8",
    });
    expect(listed).not.toMatch(/assistant_transcript/);
    const proposal = readFileSync(
      join(APP, "..", "..", "docs/proposals/assistant-transcript-v1/README.md"),
      "utf8",
    );
    expect(proposal).toMatch(/NOT APPLIED/);
  });
});
