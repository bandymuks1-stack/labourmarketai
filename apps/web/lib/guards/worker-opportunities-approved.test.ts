import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  isApprovedRouteRow,
  safeApprovedCompanyName,
  WORKER_VISIBLE_ROUTE_STATUSES,
} from "@/lib/opportunities/opportunity-fit";

/**
 * Worker Opportunities v1 — workers see only approved supply routes.
 * Locks the default-closed gate + the no-leak guarantees.
 */
const WEB = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");
/** Strip // and block comments so a doc line ("never reads contacts/notes")
 *  is not mistaken for actual free-text/contact READS in the code. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("approved-route gate is default-closed", () => {
  it("a raw / unreviewed need is NOT worker-visible", () => {
    expect(isApprovedRouteRow({ id: "1", role_text: "welder" })).toBe(false);
    expect(isApprovedRouteRow({ id: "1", route_status: "not_reviewed" })).toBe(false);
    expect(isApprovedRouteRow({ id: "1", route_status: "documents_requested" })).toBe(false);
    expect(isApprovedRouteRow({ id: "1", route_status: "limited_access" })).toBe(false);
  });

  it("a risk-flagged partner is NOT worker-visible", () => {
    expect(isApprovedRouteRow({ route_status: "risk_flagged" })).toBe(false);
  });

  it("a blocked partner is NOT worker-visible", () => {
    expect(isApprovedRouteRow({ route_status: "blocked" })).toBe(false);
  });

  it("approved / trusted / approved-route opportunities ARE worker-visible", () => {
    for (const status of WORKER_VISIBLE_ROUTE_STATUSES) {
      expect(isApprovedRouteRow({ route_status: status }), status).toBe(true);
    }
    expect(isApprovedRouteRow({ approved_route: true })).toBe(true);
  });
});

describe("no free-text / contact leak", () => {
  it("the company name is read only from the dedicated safe column", () => {
    expect(safeApprovedCompanyName({ company_name: "Approved Staffing Ltd" })).toBe("Approved Staffing Ltd");
    // never derived from free text fields:
    expect(safeApprovedCompanyName({ need_summary: "secret", role: "boss John", notes: "call 12345" })).toBeNull();
  });

  it("the worker board loader never reads free text or contacts", () => {
    const loader = code("lib/opportunities/load-worker-opportunities.ts");
    expect(loader).not.toMatch(/need_summary/);
    expect(loader).not.toMatch(/payload\s*->>\s*'role'|payload\.role/);
    expect(loader).not.toMatch(/\.notes\b|email|phone/i);
    // it filters by the approved-route gate before mapping:
    expect(loader).toMatch(/isApprovedRouteRow/);
  });
});

describe("worker board UX — trust note, approved-empty state, admin separation", () => {
  const page = read("app/[locale]/dashboard/opportunities/page.tsx");

  it("shows the trust note + the approved-empty state", () => {
    expect(page).toMatch(/trustNote/);
    expect(page).toMatch(/approvedEmptyTitle/);
    expect(page).toMatch(/approvedEmptyBody/);
  });

  it("the trust copy exists in lt/en/ru", () => {
    for (const loc of ["lt", "en", "ru"]) {
      const opp = JSON.parse(read(`messages/${loc}.json`)).opportunities;
      expect(opp.trustNote, `${loc} trustNote`).toBeTruthy();
      expect(opp.approvedEmptyTitle, `${loc} approvedEmptyTitle`).toBeTruthy();
      expect(opp.approvedEmptyBody, `${loc} approvedEmptyBody`).toBeTruthy();
    }
  });

  it("admin still has the raw-need review surface", () => {
    // The superadmin backfill page keeps full visibility of raw needs.
    expect(() => read("app/[locale]/dashboard/admin/need-structuring/page.tsx")).not.toThrow();
  });
});

describe("public positioning stays honest", () => {
  it("no guaranteed-job / verified-worker / instant-hire wording in the board copy", () => {
    for (const loc of ["lt", "en", "ru"]) {
      const opp = JSON.stringify(JSON.parse(read(`messages/${loc}.json`)).opportunities).toLowerCase();
      for (const bad of ["guaranteed", "verified worker", "instant hire", "garantuot"]) {
        expect(opp.includes(bad), `${loc}: "${bad}" must not appear`).toBe(false);
      }
    }
  });
});
