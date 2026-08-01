import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Buyer-side next-action summary — an honest summary of the caller's OWN
 * outgoing service requests from REAL statuses only (accepted / waiting /
 * declined), built over the existing `listOutgoingRequests` data. No new
 * DB / RLS / RPC, no fake rows, no payment/rating. The second-dashboard
 * card that rendered it is gone (W3 Package 4); the helper and its copy
 * stay pinned for the surviving marketplace loop.
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
