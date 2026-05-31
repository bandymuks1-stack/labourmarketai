import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Slice 5 — company review report preview honesty/wiring guard.
 *
 * The report is a read-only preview computed from existing reviewable entries +
 * the caller's own recorded review actions. It must: reuse the gated
 * reviewable set (no new RLS surface), be honest about the absent project/
 * client layer, and never claim external verification or fabricate totals.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("review report helper — read-only, reuses existing data", () => {
  const src = read("lib/journal/review-report.ts");
  it("reuses the gated reviewable RPC + computed recognition (no new RLS surface)", () => {
    expect(src).toMatch(/reviewable_journal_entry_ids/);
    expect(src).toMatch(/recognizeEntryDepth/);
    expect(src).toMatch(/getManagerEvidence/);
  });
  it("only surfaces hours when explicit AND unambiguous (no fake totals)", () => {
    expect(src).toMatch(/depth\.hours && depth\.hours\.certain/);
  });
  it("does not write or mutate (no insert/update/upsert/rpc-mutation)", () => {
    expect(src).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  });
});

describe("review report page — honest framing", () => {
  const page = read("app/[locale]/dashboard/inbox/report/page.tsx");
  it("shows the project/client absence note and a system-records origin", () => {
    expect(page).toMatch(/t\("projectNote"\)/);
    expect(page).toMatch(/t\("origin"\)/);
  });
  it("prints via the browser only (no PDF/export service)", () => {
    const btn = read("components/app/print-button.tsx");
    expect(btn).toMatch(/window\.print\(\)/);
    expect(page).toMatch(/PrintButton/);
  });
});

describe("review report i18n", () => {
  for (const locale of ["lt", "en"] as const) {
    it(`${locale} reviewReport + inbox.openReport keys exist`, () => {
      const base = JSON.parse(read(`messages/${locale}.json`)) as {
        reviewReport?: Record<string, unknown>;
      };
      const rr = base.reviewReport ?? {};
      for (const k of ["title", "print", "origin", "empty", "projectNote", "noWorks", "uncertaintyNote"]) {
        expect(rr[k], `${locale} reviewReport.${k}`).toBeTruthy();
      }
      expect((rr.totals as Record<string, string>)?.pending).toBeTruthy();
      const j = JSON.parse(read(`messages/${locale}/journal.json`)) as {
        inbox: Record<string, string>;
      };
      expect(j.inbox.openReport, `${locale} inbox.openReport`).toBeTruthy();
    });
  }
});
