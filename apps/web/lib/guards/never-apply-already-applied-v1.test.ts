import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { REVIEWED_APPLY_SHAPES } from "@/lib/migrations/parity-model";

/**
 * Never-apply guard for migration files that are ALREADY LIVE under a
 * DIFFERENT ledger name (owner decision 4a, 2026-09-14).
 *
 * The hazard this closes is narrow and real. `parity-model.ts` answers one
 * direction — "every APPLIED row has a repo file" — and answers it well. It
 * cannot answer the reverse: "this repo FILE must never be applied". A file
 * whose objects are already live reads, to a session scanning the tree, as an
 * ordinary pending migration; two of these three additionally carried
 * `@human-gate-approved`, which reads as PRE-AUTHORISED. Applying one re-runs
 * DDL against objects holding production data (`journal_entry_photos` has 11
 * real rows) or churns a live CHECK constraint.
 *
 * The marker lives in `docs/APPLIED_LEDGER.md`, NOT in the SQL headers, and
 * that is a deliberate choice rather than a convenience. Editing one of these
 * files makes `migration-safety` re-scan it, and their already-applied contents
 * are inherently RED (SECURITY DEFINER, grants, policy changes, DML), so every
 * future touch would fail CI. The only bypass the scanner offers is
 * `@human-gate-approved`, which asserts "approved to apply" — the exact
 * opposite of the truth here. APPLIED_LEDGER.md is already where never-apply
 * verdicts live (`company_locations_v1`, `company_memberships_v1`), so this
 * extends the canonical register instead of inventing a second one.
 *
 * This guard pins those ledger entries AND cross-checks every ledger name they
 * claim against `REVIEWED_APPLY_SHAPES`, so the never-apply verdict and the
 * canonical parity accounting cannot drift apart.
 */

const REPO = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(REPO, rel), "utf8");

/** file stem -> the production ledger name(s) it is already live under. */
const ALREADY_APPLIED: Readonly<Record<string, readonly string[]>> = {
  "20260612091000_journal_entry_photos": [
    "journal_entry_photos_table",
    "journal_entry_photos_rpc",
    "journal_entry_photos_storage",
  ],
  "20260817130100_notification_events_v3_workflow_types": [
    "notification_types_union_workflow_document_v3",
  ],
  "20260817140100_notification_document_types_v3": [
    "notification_types_union_workflow_document_v3",
  ],
};

describe("the ledger carries an explicit never-apply verdict for each file", () => {
  const ledger = read("docs/APPLIED_LEDGER.md");

  it("the never-apply section exists", () => {
    expect(
      ledger,
      "docs/APPLIED_LEDGER.md lost its NEVER APPLY section — the canonical place " +
        "a session learns these files must not be applied.",
    ).toContain("🚫 NEVER APPLY — already live under a different ledger name");
  });

  for (const stem of Object.keys(ALREADY_APPLIED)) {
    it(`${stem} is recorded as never-apply`, () => {
      const line = ledger
        .split("\n")
        .find((l) => l.includes(`${stem}.sql`) && l.includes("ALREADY APPLIED"));
      expect(
        line,
        `${stem} is live in production under another ledger name and the ledger ` +
          `must say so, or the next session reads the file as pending and applies it.`,
      ).toBeDefined();
      expect(line).toContain("MUST NOT BE APPLIED");
    });

    it(`${stem}'s ledger entry names the row(s) it is already live under`, () => {
      const section = ledger.slice(
        ledger.indexOf("🚫 NEVER APPLY"),
        ledger.indexOf("\n## ", ledger.indexOf("🚫 NEVER APPLY") + 10),
      );
      const entry = section.slice(section.indexOf(`${stem}.sql`));
      for (const ledgerName of ALREADY_APPLIED[stem]!) {
        expect(
          entry.slice(0, 2000),
          `${stem}'s entry must name ${ledgerName} so the claim is checkable against production`,
        ).toContain(ledgerName);
      }
    });
  }
});

describe("the never-apply claim agrees with the canonical parity accounting", () => {
  it("every ledger name claimed here is a REVIEWED apply shape for that same file", () => {
    for (const [stem, ledgerNames] of Object.entries(ALREADY_APPLIED)) {
      for (const ledgerName of ledgerNames) {
        const shape = REVIEWED_APPLY_SHAPES[ledgerName];
        expect(
          shape,
          `${ledgerName} is claimed as the live name of ${stem}, and parity-model.ts ` +
            `does not review it. One of the two is wrong — fix the accounting, not this test.`,
        ).toBeDefined();
        const stems =
          shape!.kind === "union" ? shape!.repoStems : [shape!.repoStem];
        expect(
          stems,
          `${ledgerName} is reviewed in parity-model.ts, but not as a shape of ${stem}`,
        ).toContain(stem);
      }
    }
  });
});

describe("the stale gate annotations are recorded as stale, not silently deleted", () => {
  const ledger = read("docs/APPLIED_LEDGER.md");

  for (const stem of [
    "20260817130100_notification_events_v3_workflow_types",
    "20260817140100_notification_document_types_v3",
  ]) {
    it(`${stem} keeps its @human-gate-approved line in the file`, () => {
      // History is evidence. The authorisation is retained verbatim — and
      // editing the file would trip migration-safety for no benefit.
      expect(read(`supabase/migrations/${stem}.sql`)).toContain("@human-gate-approved");
    });

    it(`the ledger records that ${stem}'s annotation is stale`, () => {
      const section = ledger.slice(ledger.indexOf("🚫 NEVER APPLY"));
      const entry = section.slice(section.indexOf(`${stem}.sql`), section.indexOf(`${stem}.sql`) + 2000);
      expect(
        entry,
        `${stem} still reads as pre-authorised unless the ledger says its annotation is stale`,
      ).toMatch(/STALE/);
    });
  }
});
