/**
 * GUARD — P0 2026-11-22: a privacy request (data export / account deletion,
 * stored in customer_requests by submit_privacy_request_v1) is never a labour
 * need. It is not offered for sharing with an agency, not matched in the
 * workbench, not counted in an organization's needs or insights, and uses up
 * no open-needs quota. The cross-organization boards already exclude it by
 * kind (list_open_demand_for_agencies / _for_workers allow only null,
 * company_request and buyer_request).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { isLabourDemandRow } from "@/lib/demand/market-direction";

const WEB = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(WEB, p), "utf8");

describe("privacy requests stay off commercial surfaces", () => {
  it("a privacy row is not a labour demand row", () => {
    const privacy = { kind: "customer_request", payload: { source: "privacy_self_service", privacy_request_type: "account_deletion" } };
    expect(isLabourDemandRow(privacy)).toBe(false);
    expect(isLabourDemandRow({ kind: "customer_request", payload: { role: "tiler" } })).toBe(true);
  });

  it("the agency share picker lists labour needs only", () => {
    const src = read("lib/agency/clients.ts");
    const fn = src.slice(src.indexOf("export async function listAgencyDemands"));
    expect(fn).toContain('const base = "id, title, status, created_at, kind, payload";');
    expect(fn).toContain("isLabourDemandRow({ kind: r.kind as string | null, payload: r.payload })");
  });

  it("the matching workbench never matches or re-statuses a privacy request", () => {
    const src = read("lib/admin/matching-workbench.ts");
    const fn = src.slice(src.indexOf("export async function recordHumanMatch"));
    expect(fn.indexOf("isPrivacyRequestPayload(existing.payload)")).toBeGreaterThan(0);
    expect(fn.indexOf("isPrivacyRequestPayload(existing.payload)")).toBeLessThan(fn.indexOf(".update({"));
  });

  it("organization rollups, insights and the needs quota leave privacy rows out", () => {
    expect(read("lib/company/org-demand-rollup.ts")).toContain(".filter((r) => isLabourDemandRow(r))");
    expect(read("lib/intelligence/intelligence-read.ts")).toContain('.is("payload->>privacy_request_type", null)');
    expect(read("lib/billing/open-needs-gate.ts")).toContain('.is("payload->>privacy_request_type", null)');
  });

  it("the cross-organization boards keep their kind allow-list", () => {
    const m = read("../../supabase/migrations/20261028123000_synthetic_demand_cross_org_readers_v1.sql");
    expect(m).toMatch(/cr\.kind is null or cr\.kind in \('company_request',\s*'buyer_request'\)/);
  });
});
