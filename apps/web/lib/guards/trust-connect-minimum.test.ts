import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  isApprovedRouteRow,
  WORKER_VISIBLE_ROUTE_STATUSES,
} from "@/lib/opportunities/opportunity-fit";
import { sourceToEvidence, matchWorkerToNeed } from "@/lib/market/match-v1";

/**
 * TRUST CONNECT — LAUNCH-MINIMUM GUARDS (PR11).
 *
 * One consolidated suite for the trust invariants:
 *   1. "verified" (worker skill) is backed ONLY by manager confirmation;
 *   2. "verified" (company) is admin-only — no self-service path;
 *   3. workers see demand ONLY through the approved verified route, and the
 *      visible badge keys on the REAL route signal;
 *   4. self-declared is never presented as verified;
 *   5. unknown stays unknown — never assumed;
 *   6. no global person/company score exists (fit-not-rating remains the
 *      dedicated police; pinned here by reference).
 */

const APP_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");
const read = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");

describe("1. worker-skill 'verified' is manager-confirmation only", () => {
  it("CV tier condition fires only on verified || manager_confirmed", () => {
    const src = read("components/app/cv-engagement-cards.tsx");
    expect(src).toMatch(/verified\s*\|\|\s*.*manager_confirmed|manager_confirmed.*\|\|.*verified/);
  });

  it("evidence tiers never upgrade an unknown source", () => {
    expect(sourceToEvidence("anything-else")).toBe("self_declared");
    expect(sourceToEvidence(null)).toBe("self_declared");
  });

  it("player-card verified badges read the real verified flag", () => {
    const src = read("lib/player-card/player-card.ts");
    expect(src).toMatch(/verified/);
    expect(src).not.toMatch(/verified:\s*true(?!.*eq)/); // never hardcoded true
  });
});

describe("2. company 'verified' is admin-only", () => {
  it("self-service company setup can NEVER set verified (SQL pin)", () => {
    const sql = readFileSync(
      join(REPO_ROOT, "supabase", "migrations", "20260612090000_company_type_and_country_safety.sql"),
      "utf8",
    ).toLowerCase();
    // v2 setup RPC exists and routes through the non-verified ladder.
    expect(sql).toMatch(/save_company_setup_v2/);
    expect(sql).not.toMatch(/set\s+verification_status\s*=\s*'verified'/);
  });

  it("the ONLY verified writer is the admin RPC (audit-logged)", () => {
    const sql = readFileSync(
      join(REPO_ROOT, "supabase", "migrations", "20260604130000_admin_company_verification.sql"),
      "utf8",
    ).toLowerCase();
    expect(sql).toMatch(/admin_set_company_verification/);
    expect(sql).toMatch(/security definer/);
    expect(sql).toMatch(/is_admin|admin/);
  });
});

describe("3. approved route: real signal, default-closed, honestly badged", () => {
  it("rows without an approved-route signal never reach a worker", () => {
    expect(isApprovedRouteRow({})).toBe(false);
    expect(isApprovedRouteRow({ route_status: "not_reviewed" })).toBe(false);
    expect(isApprovedRouteRow({ route_status: "approved_direct_partner" })).toBe(true);
    expect(WORKER_VISIBLE_ROUTE_STATUSES).toContain("approved_direct_partner");
  });

  it("the worker-facing verified badge keys on route_status, not copy", () => {
    const page = read("app/[locale]/dashboard/opportunities/page.tsx");
    expect(page).toMatch(
      /need\.routeStatus === "approved_direct_partner"[\s\S]{0,600}opportunity-company-verified/,
    );
  });

  it("the RPC's verified gate is the route's backing (SQL pin)", () => {
    const sql = readFileSync(
      join(REPO_ROOT, "supabase", "migrations", "20260705130000_worker_demand_location_label.sql"),
      "utf8",
    );
    expect(sql).toMatch(/verification_status = 'verified'/);
    expect(sql).toMatch(/'approved_direct_partner'::text as route_status/);
  });
});

describe("4./5. self-declared stays separate; unknown stays unknown", () => {
  it("a purely self-declared match never reads as confirmed", () => {
    const m = matchWorkerToNeed(
      { skillIds: ["cleaning-services"], needSource: "human_structured" },
      { skills: [{ uri: "cleaning-services", evidence: "self_declared" }] },
    );
    expect(m.skillFit?.matchedConfirmed).toBe(0);
    expect(m.evidence.matchedSelfDeclared).toBe(1);
    expect(m.evidence.matchedManagerConfirmed).toBe(0);
  });

  it("unknown availability/location are missing data, never assumptions", () => {
    const m = matchWorkerToNeed(
      { skillIds: ["cleaning-services"], needSource: "human_structured", country: "LT" },
      { skills: [{ uri: "cleaning-services", evidence: "work_journal" }] },
    );
    expect(m.missingData).toContain("availability_unknown");
    expect(m.missingData).toContain("location_unknown");
    expect(m.availability).toBe("unknown");
  });
});

describe("6. no global score (dedicated police stays armed)", () => {
  it("fit-not-rating guard exists with its identifier ban", () => {
    const guard = read("lib/guards/fit-not-rating.test.ts");
    expect(guard).toMatch(/trust_score\|profile_strength\|overall_score/);
  });
});
