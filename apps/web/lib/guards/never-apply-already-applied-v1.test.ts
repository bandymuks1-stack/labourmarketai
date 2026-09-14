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
 * So this guard pins the marker in the FILE, and cross-checks it against the
 * canonical `REVIEWED_APPLY_SHAPES` accounting rather than restating it. It
 * deliberately does not introduce a second register: the ledger-name truth
 * stays in parity-model.ts, and this only asserts the file says so too.
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

describe("a migration that is already live says so in its own first lines", () => {
  for (const stem of Object.keys(ALREADY_APPLIED)) {
    it(`${stem} carries the never-apply marker`, () => {
      const sql = read(`supabase/migrations/${stem}.sql`);
      const head = sql.slice(0, 2400);
      expect(
        head,
        `${stem} is live in production under another ledger name and must say so ` +
          `in its header, or the next session reads it as pending and applies it.`,
      ).toContain("ALREADY APPLIED — MUST NOT BE APPLIED AGAIN");
    });

    it(`${stem} names the ledger row(s) it is already live under`, () => {
      const sql = read(`supabase/migrations/${stem}.sql`);
      for (const ledgerName of ALREADY_APPLIED[stem]!) {
        expect(
          sql.slice(0, 2400),
          `${stem} must name ${ledgerName} so the claim is checkable against production`,
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

describe("the stale gate annotations are marked stale, not silently deleted", () => {
  for (const stem of [
    "20260817130100_notification_events_v3_workflow_types",
    "20260817140100_notification_document_types_v3",
  ]) {
    it(`${stem} keeps its original @human-gate-approved line and says it is stale`, () => {
      const sql = read(`supabase/migrations/${stem}.sql`);
      // History is evidence: the authorisation is retained, never rewritten.
      expect(sql).toContain("@human-gate-approved");
      expect(
        sql.slice(0, 2400),
        `${stem} still reads as pre-authorised unless the header says the annotation is stale`,
      ).toMatch(/annotation below is STALE/);
    });
  }
});
