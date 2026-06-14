import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { computeOpportunityFit } from "@/lib/opportunities/opportunity-fit";

/**
 * Locks the worker-facing opportunities board:
 *  - the page is worker-gated and reachable from the profile;
 *  - the loader never fabricates needs (honest "needs data access" state);
 *  - the fit is a neutral status, never a numeric score / "AI match".
 */
const WEB = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

describe("worker opportunities board — exists, gated, reachable", () => {
  const page = read("app/[locale]/dashboard/opportunities/page.tsx");

  it("is gated to the worker role", () => {
    expect(page).toMatch(/requireRoleOrRedirect\(\s*locale\s*,\s*"worker"\s*\)/);
  });

  it("renders the neutral statuses, not a score", () => {
    expect(page).toContain("status.");
    expect(page).not.toMatch(/\d+%\s*match/i);
  });

  it("is reachable from the worker profile", () => {
    const profile = read("app/[locale]/dashboard/profile/page.tsx");
    expect(profile).toContain("/dashboard/opportunities");
  });
});

describe("worker opportunities loader is honest — no fabricated needs", () => {
  const loader = read("lib/opportunities/load-worker-opportunities.ts");

  it("falls back to a needs-data-access state rather than inventing needs", () => {
    expect(loader).toMatch(/needsDataAccess/);
    // The only way to populate opportunities is from the RPC rows.
    expect(loader).toMatch(/list_open_demand_for_workers/);
  });

  it("reads own data only (no cross-worker reads here)", () => {
    expect(loader).toMatch(/profile_id.*user\.id|eq\("profile_id", user\.id\)/);
  });
});

describe("opportunity fit is neutral (no score)", () => {
  it("returns only a status + gap codes", () => {
    const r = computeOpportunityFit(
      { hasWorkType: true, hasSkills: true, countries: ["NL"], availabilitySet: true, documentsCount: 1 },
      { id: "x", roleText: "Cook", country: "NL", teamSize: 2, startPeriod: null, accommodation: null },
    );
    expect(typeof r.status).toBe("string");
    expect(Array.isArray(r.gaps)).toBe(true);
    expect(Object.keys(r).sort()).toEqual(["gaps", "status"]);
  });
});
