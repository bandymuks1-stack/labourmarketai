import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, type Dirent } from "node:fs";
import { join, relative } from "node:path";

/**
 * W8 / W14-6 — org demand rollup v1 stays org-scoped and honest.
 *
 * The rollup is the first employer analytics built on the org demand spine
 * (`20260806200000`). Three properties must hold, in the same shape
 * `company-intelligence-owner-scope.test.ts` pins for the intelligence read:
 *
 *  1. SCOPE — every row read is bound to the RESOLVED organization
 *     (`requireEmployerCompany()`, no caller-supplied id), so the
 *     `is_admin()` RLS branch can never cross-aggregate tenants on a
 *     company surface.
 *  2. HONESTY (A-12) — time-to-fill has no denominator until real accepted
 *     bookings exist; it must be an explicit unmeasured state, and the page
 *     must render that state as a sentence, never as a zero tile.
 *  3. PLACEMENT — never rendered under a platform-admin route, and
 *     `no-company-context` is its own state (the personal fallback is a
 *     DIFFERENT basis, labelled as such).
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

const ROLLUP = read("lib/company/org-demand-rollup.ts");
const HUB = read("lib/reports/reports-hub.ts");
const PAGE = read("app/[locale]/dashboard/reports/page.tsx");

describe("scope — the rollup reads only the resolved organization's rows", () => {
  it("resolves the org via the ONE canonical fail-closed resolver", () => {
    expect(ROLLUP).toMatch(/requireEmployerCompany\(\)/);
    expect(ROLLUP).toMatch(/no-company-context/);
  });

  it("every table read carries the org predicate", () => {
    const orgPredicates = ROLLUP.match(
      /\.eq\(\s*"organization_id"\s*,\s*orgId\s*\)/g,
    );
    // customer_requests + demand_shortlist + booking_requests; interest
    // signals are joined through the org's own request ids instead (the
    // table has no org column).
    expect(orgPredicates?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(ROLLUP).toMatch(/\.in\(\s*"request_id"\s*,\s*requestIds/);
  });

  it("takes no organization or profile id as an argument", () => {
    expect(ROLLUP).toMatch(/export async function getOrgDemandRollup\(\s*\)/);
  });

  it("never uses a profile_id predicate — that was the pre-spine scope", () => {
    expect(ROLLUP).not.toMatch(/\.eq\(\s*"profile_id"/);
  });

  it("does not live in the org-column-free pinned modules", () => {
    // `org-demand-spine-v2.test.ts` pins scouting.ts and booking-actions.ts
    // as organization_id-free source text; the rollup must stay out.
    expect(read("lib/scouting/scouting.ts")).not.toMatch(/org-demand-rollup/);
    expect(read("lib/booking/booking-actions.ts")).not.toMatch(
      /org-demand-rollup/,
    );
  });
});

describe("honesty — unmeasured facts are said, never zeroed", () => {
  it("time-to-fill has an explicit unmeasured state", () => {
    expect(ROLLUP).toMatch(/state:\s*"unmeasured"/);
  });

  it("the page renders the unmeasured state as a sentence, not a tile", () => {
    expect(PAGE).toMatch(/reports-demand-ttf-unmeasured/);
    expect(PAGE).toMatch(/timeToFillUnmeasured/);
    // The measured tile renders ONLY in the measured state.
    expect(PAGE).toMatch(
      /timeToFill\.state === "measured"[\s\S]{0,200}timeToFillDays/,
    );
  });

  it("the two demand scopes carry two different basis labels", () => {
    expect(PAGE).toMatch(/basisKey="orgDemandOrg"/);
    expect(PAGE).toMatch(/basisKey="orgDemand"/);
    expect(HUB).toMatch(/state: "own"/);
  });

  it("the copy exists in every active locale", () => {
    for (const locale of ["lt", "en", "ru", "nl", "de"]) {
      const m = JSON.parse(read(`messages/${locale}.json`)) as {
        reports?: {
          org?: { demand?: Record<string, string> };
          basis?: Record<string, string>;
        };
      };
      for (const key of [
        "structured",
        "shortlisted",
        "interest",
        "timeToFillDays",
        "timeToFillUnmeasured",
      ]) {
        expect(
          (m.reports?.org?.demand?.[key] ?? "").trim(),
          `${locale} reports.org.demand.${key}`,
        ).not.toBe("");
      }
      expect(
        (m.reports?.basis?.orgDemandOrg ?? "").trim(),
        `${locale} reports.basis.orgDemandOrg`,
      ).not.toBe("");
    }
  });
});

describe("placement — a company surface, never an admin one", () => {
  it("is not imported under any admin route", () => {
    const adminRoot = join(APP, "app", "[locale]", "dashboard", "admin");
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      let entries: Dirent[];
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const abs = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(abs);
        } else if (/\.tsx?$/.test(entry.name)) {
          let src = "";
          try {
            src = readFileSync(abs, "utf8");
          } catch {
            continue;
          }
          if (src.includes("getOrgDemandRollup")) {
            offenders.push(relative(APP, abs));
          }
        }
      }
    };
    walk(adminRoot);
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("the hub consumes it org-first with the personal fallback second", () => {
    expect(HUB).toMatch(
      /getOrgDemandRollup\(\)[\s\S]{0,900}listOwnCustomerRequests\(\)/,
    );
  });
});
