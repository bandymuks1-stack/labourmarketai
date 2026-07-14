import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Buyer-side dashboard next-action — a compact, status-gated card summarising the
 * caller's OWN outgoing service requests from REAL statuses only (accepted /
 * waiting / declined), built over the existing `listOutgoingRequests` data. No
 * new DB / RLS / RPC, no fake rows, no payment/rating. Mirrors the provider
 * badge's honest, count-gated control-room pattern.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("getOutgoingRequestSummary is an honest real-status summary", () => {
  const src = read("lib/marketplace/service-requests.ts");

  it("is exported and derives from listOutgoingRequests", () => {
    expect(src).toMatch(/export async function getOutgoingRequestSummary\(\): Promise<OutgoingRequestSummary>/);
    expect(src).toMatch(/await listOutgoingRequests\(\)/);
  });

  it("returns all-zero on any non-ok result (honest degradation)", () => {
    expect(src).toMatch(/if \(result\.kind !== "ok"\) return \{ sent: 0, accepted: 0, declined: 0 \};/);
  });

  it("counts each real status from the rows (no fabrication)", () => {
    expect(src).toMatch(/sent: rows\.filter\(\(r\) => r\.status === "sent"\)\.length/);
    expect(src).toMatch(/accepted: rows\.filter\(\(r\) => r\.status === "accepted"\)\.length/);
    expect(src).toMatch(/declined: rows\.filter\(\(r\) => r\.status === "declined"\)\.length/);
  });
});

describe("the dashboard renders the buyer status card honestly", () => {
  const page = read("app/[locale]/dashboard/page.tsx");

  it("computes the summary via the marketplace helper", () => {
    // Called inside the page's parallel batch (P0 latency audit); the result
    // lands in `outgoingSummary` via the Promise.all destructure.
    expect(page).toMatch(/getOutgoingRequestSummary\(\),/);
    expect(page).toMatch(/outgoingSummary,/);
  });

  it("is status-gated: no card when there are no outgoing requests (no fake urgency)", () => {
    // outgoingState is null unless a real accepted/sent/declined count exists
    expect(page).toMatch(/outgoingRequestsNextAction = outgoingState \?/);
    expect(page).toMatch(/: null;/);
  });

  it("prioritises accepted as the strongest next action, then waiting, then declined", () => {
    expect(page).toMatch(/outgoingSummary\.accepted > 0\s*\?\s*"accepted"/);
    expect(page).toMatch(/outgoingSummary\.sent > 0\s*\?\s*"waiting"/);
    expect(page).toMatch(/outgoingSummary\.declined > 0\s*\?\s*"declined"/);
  });

  it("links into the real request loop and shows a real count", () => {
    expect(page).toMatch(/data-testid="dashboard-outgoing-requests-next-action"/);
    expect(page).toMatch(/"\/dashboard\/service-requests" as "\/dashboard"/);
    expect(page).toMatch(/\{outgoingCount\}/);
    expect(page).toMatch(/tabular-nums/);
  });

  it("is rendered in BOTH the org and worker overview branches", () => {
    // Org branch: mounted directly. Worker branch (audit PR6): either promoted
    // into the state-driven top slot (an ACCEPTED request is the strongest
    // state after an invitation) or rendered in the remaining-states list.
    expect(page).toMatch(/\{outgoingRequestsNextAction\}/);
    expect(page).toMatch(
      /topSlot !== "accepted_request" && outgoingRequestsNextAction/,
    );
    expect(page).toMatch(/"accepted_request" \? \(\s*outgoingRequestsNextAction/);
  });
});

describe("buyer status copy exists across active locales (no panic / no payment)", () => {
  for (const loc of ["en", "lt", "ru"] as const) {
    it(`${loc}: dashboardOutgoing.{accepted,waiting,declined}.{title,note} present`, () => {
      const m = (JSON.parse(read(`messages/${loc}.json`)) as {
        marketplace?: { dashboardOutgoing?: Record<string, { title?: unknown; note?: unknown }> };
      }).marketplace?.dashboardOutgoing ?? {};
      for (const state of ["accepted", "waiting", "declined"] as const) {
        for (const field of ["title", "note"] as const) {
          const v = m[state]?.[field];
          expect(typeof v, `${loc}.${state}.${field}`).toBe("string");
          expect(String(v).trim().length, `${loc}.${state}.${field}`).toBeGreaterThan(0);
        }
      }
      const blob = JSON.stringify(m);
      expect(blob).not.toMatch(/\b(payment|stripe|rating|review|stars?)\b/i);
    });
  }
});
