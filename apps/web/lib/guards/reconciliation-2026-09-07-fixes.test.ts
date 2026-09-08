import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  PROFESSIONAL_HISTORY_RELATIONSHIPS,
  PRACTICE_RELATIONSHIPS,
} from "@/lib/player-card/work-history-model";
import { isDemandKind, DEMAND_KIND_OR_FILTER } from "@/lib/demand/market-direction";

/**
 * TWO RECONNECTIONS FROM THE 2026-09-07 FULL PRODUCT RECONCILIATION.
 *
 * Both are the same shape of defect: a surface kept its OWN copy of a rule
 * that already had a canonical home, the canonical one moved, and the copy did
 * not. Neither needed a migration; both were invisible because the copy still
 * looked reasonable on its own.
 *
 * Evidence: docs/reconciliation/FULL_PRODUCT_RECONCILIATION_2026-09-07.md §11.
 */

const read = (rel: string) => readFileSync(join(__dirname, "..", "..", rel), "utf8");

describe("a placement appears on the person's own profile", () => {
  /**
   * `save_self_declared_work_history_v1` has accepted `student` and
   * `volunteer` IN PRODUCTION since 2026-08-27 (ledger `20260827062354`;
   * verified in the live catalogue on 2026-09-07). The CV, the read model and
   * the onboarding student step all render placements.
   *
   * The profile page did not — it filtered `engagement_contexts` through a
   * LOCAL copy of `WORKER_RELATIONSHIPS`, which is the PAID/CONTRACTED list.
   * So a student who completed a real placement saved it successfully and then
   * could not see it on their own profile, which is precisely the "absence of
   * formal employment must never render as no experience" rule
   * (ARCHITECTURE I-9, §5.4).
   */
  it("the canonical list carries practice alongside employment", () => {
    for (const slug of PRACTICE_RELATIONSHIPS) {
      expect(PROFESSIONAL_HISTORY_RELATIONSHIPS).toContain(slug);
    }
  });

  it("`manager` stays out — an administrative tie is not the person's work", () => {
    expect(PROFESSIONAL_HISTORY_RELATIONSHIPS).not.toContain("manager");
  });

  it("the profile page filters by the canonical list, not a local copy", () => {
    const page = read("app/[locale]/dashboard/profile/page.tsx");
    expect(page).toMatch(
      /import \{ PROFESSIONAL_HISTORY_RELATIONSHIPS \} from "@\/lib\/player-card\/work-history-model"/,
    );
    expect(page).toMatch(/\.in\("relationship_slug", HISTORY_RELATIONSHIPS\)/);
    // The local literal must not come back. A second list is how this broke.
    expect(page).not.toMatch(/const WORKER_RELATIONSHIPS = \[/);
  });
});

describe("the market map serves demand only", () => {
  /**
   * Measured 2026-09-07: `world-read.ts` applied its kind filter ONLY when the
   * caller had no employer workspace. An agency HAS one, so its leg ran with
   * no direction filter at all and mapped its own `agency_offer` rows onto the
   * map as `actionable: true` demand — two agencies each saying "we have
   * people" shown to the other as a need.
   *
   * That is the same defect #1588 (worker board) and #1596 (agency board)
   * closed in SQL, still live in TypeScript. The inline literal had also
   * drifted: it listed `buyer_request` and `customer_request` but not
   * `company_request`.
   */
  it("agency supply is not demand, and null-kind buyer rows still are", () => {
    expect(isDemandKind("agency_offer")).toBe(false);
    expect(isDemandKind("company_request")).toBe(true);
    expect(isDemandKind(null)).toBe(true);
  });

  it("EVERY world-read path filters direction through the canonical set", () => {
    const src = read("lib/market-map/world-read.ts");
    /**
     * SUPERSEDED BY A BETTER FIX, AND RE-PINNED TO THE INTENT.
     *
     * This asserted one unconditional `.or(DEMAND_KIND_OR_FILTER)` — my own
     * 2026-09-07 fix, which removed the Stage-A workspace gate to get the
     * filter applied on every path. #1602 landed the same fix on main without
     * that cost: BOTH paths now derive from `market-direction.ts`, and the
     * narrower non-employer set survives for a caller with no employer
     * workspace. Theirs is strictly better, so the merge took it.
     *
     * What must hold is the INTENT — no path reaches `customer_requests`
     * without a direction filter, and no filter is hand-written — not the
     * particular shape my version happened to have.
     */
    expect(src).toMatch(/from "@\/lib\/demand\/market-direction"/);
    expect(src).toContain("DEMAND_KIND_OR_FILTER");
    // Every `.or(` on this read is one of the canonical filters, never a
    // literal kind list assembled here.
    for (const call of src.match(/\.or\([^)]*\)/g) ?? []) {
      expect(call, `hand-written direction filter: ${call}`).toMatch(
        /DEMAND_KIND_OR_FILTER|NON_EMPLOYER_DEMAND_KIND_OR_FILTER/,
      );
    }
    // No hand-written kind list may survive anywhere in this file.
    expect(src).not.toMatch(/kind\.eq\.[a-z_]+/);
  });

  it("the canonical filter itself still excludes supply", () => {
    expect(DEMAND_KIND_OR_FILTER).not.toContain("agency_offer");
    expect(DEMAND_KIND_OR_FILTER).toContain("kind.eq.company_request");
  });
});
