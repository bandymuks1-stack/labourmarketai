import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Slice 1 guard — demand → read-back/status loop.
 *
 * The company/agency cockpit "Submit your need" CTA writes a real
 * `customer_requests` row (submit_demand_request). This guard pins the
 * READ-BACK: the overview reads the owner's own rows via the canonical
 * RLS-scoped `listOwnCustomerRequests` and shows each request's real stored
 * status — with NO fake matching / candidate suggestion (matching engine stays
 * dormant per the convergence decision).
 */

const APP = join(__dirname, "..", "..");
function read(rel: string): string {
  return readFileSync(join(APP, rel), "utf8");
}

describe("Guard: overview wires the canonical demand read-back", () => {
  const page = read("app/[locale]/dashboard/page.tsx");

  it("imports the canonical read-back query + the read-back component", () => {
    expect(page).toMatch(
      /from\s+["']@\/lib\/buyer\/customer-requests["']/,
    );
    expect(page).toMatch(/listOwnCustomerRequests/);
    expect(page).toMatch(
      /from\s+["']@\/components\/app\/demand-requests-readback["']/,
    );
    expect(page).toMatch(/<DemandRequestsReadback\b/);
  });

  it("reads back through the RLS-scoped query, not a new matching table", () => {
    expect(page).not.toMatch(/from\(["'](matches|match_actions|job_demands)["']\)/);
  });

  it("gates the read-back to company/agency (customer has its own requests surface)", () => {
    expect(page).toMatch(/role === "company" \|\| role === "agency"/);
  });
});

describe("Guard: the read-back component is honest + status-only", () => {
  const src = read("components/app/demand-requests-readback.tsx");

  it("renders real status from the canonical row type", () => {
    expect(src).toMatch(/CustomerRequestsListResult/);
    expect(src).toMatch(/labels\.status\[r\.status\]/);
    expect(src).toMatch(/data-testid="demand-requests-readback"/);
  });

  it("invents no matching / candidate / score surface", () => {
    const codeOnly = src
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n]*/g, " ");
    expect(codeOnly).not.toMatch(/match|candidate|score|suggest/i);
  });
});

describe("Guard: demandReadback i18n is present + honest (lt + en)", () => {
  for (const locale of ["lt", "en"] as const) {
    it(`${locale}.json demandReadback keys present, note makes no matching claim`, () => {
      const json = JSON.parse(read(`messages/${locale}.json`)) as {
        demandReadback?: Record<string, string>;
      };
      const ns = json.demandReadback;
      expect(ns, `${locale}.demandReadback missing`).toBeTruthy();
      for (const key of ["heading", "note", "empty", "created"]) {
        expect(ns![key], `${locale}.demandReadback.${key}`).toBeTruthy();
      }
      const flat = JSON.stringify(ns).toLowerCase();
      expect(flat).not.toMatch(/\bai[\s-]*match|automatic match|guaranteed|fake/);
    });
  }
});
