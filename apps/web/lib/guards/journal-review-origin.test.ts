import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deriveReviewOrigin } from "@/lib/journal/review-status";

/**
 * Slice 5 guard — work-journal review ORIGIN (who/when) is visible.
 *
 * The worker entries already showed a review STATUS. The DoD also wants the
 * confirmation origin: who (engagement role) and when. This pins that the
 * origin is derived from the real append-only evidence rows and surfaced.
 */

const APP = join(__dirname, "..", "..");
function read(rel: string): string {
  return readFileSync(join(APP, rel), "utf8");
}

describe("deriveReviewOrigin returns the latest decision's role + timestamp", () => {
  it("null while still submitted (no evidence)", () => {
    expect(deriveReviewOrigin([])).toBeNull();
    expect(deriveReviewOrigin(null)).toBeNull();
  });

  it("returns who/when of the latest-wins decision", () => {
    const origin = deriveReviewOrigin([
      {
        confirmation_scope: { decision: "changes_requested" },
        created_at: "2026-05-01T00:00:00Z",
        confirmer_role: "manager",
      },
      {
        confirmation_scope: { decision: "approved" },
        created_at: "2026-05-10T00:00:00Z",
        confirmer_role: "owner",
      },
    ]);
    expect(origin).toEqual({
      result: "approved",
      role: "owner",
      at: "2026-05-10T00:00:00Z",
    });
  });
});

describe("the journal page surfaces the review origin", () => {
  const page = read("app/[locale]/dashboard/journal/page.tsx");

  it("reads confirmer_role and derives the origin", () => {
    expect(page).toMatch(/confirmation_scope, created_at, confirmer_role/);
    expect(page).toMatch(/deriveReviewOrigin\(e\.journal_entry_confirmations\)/);
  });

  it("renders the who/when origin labels", () => {
    expect(page).toMatch(/t\("entry\.reviewedBy"\)/);
    expect(page).toMatch(/entry\.confirmerRole\.\$\{origin\.role\}/);
    expect(page).toMatch(/origin\.at\.slice\(0, 10\)/);
  });
});

describe("review-origin i18n present (lt + en journal namespace)", () => {
  for (const locale of ["lt", "en"] as const) {
    it(`${locale}/journal.json entry.reviewedBy + confirmerRole present`, () => {
      const json = JSON.parse(read(`messages/${locale}/journal.json`)) as {
        entry?: { reviewedBy?: string; confirmerRole?: Record<string, string> };
      };
      expect(json.entry?.reviewedBy, `${locale} entry.reviewedBy`).toBeTruthy();
      expect(json.entry?.confirmerRole?.manager).toBeTruthy();
      expect(json.entry?.confirmerRole?.owner).toBeTruthy();
      expect(json.entry?.confirmerRole?.external_manager).toBeTruthy();
    });
  }
});
