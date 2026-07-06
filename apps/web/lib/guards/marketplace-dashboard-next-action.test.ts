import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Train B — the marketplace request loop is surfaced on the dashboard as a
 * compact, count-gated provider next-action card (mirrors the booking-badge
 * pattern). Pins: an honest count helper (0 on any non-ok state, only 'sent'
 * counted), the dashboard renders the card ONLY when count > 0 and links into
 * the real /dashboard/service-requests loop, and the i18n keys exist in all
 * three active locales. No new DB object — pure UI over shipped server actions.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("getPendingIncomingRequestCount is an honest, open-only count", () => {
  const src = read("lib/marketplace/service-requests.ts");

  it("is exported and derives from listIncomingRequests", () => {
    expect(src).toMatch(/export async function getPendingIncomingRequestCount\(\): Promise<number>/);
    expect(src).toMatch(/await listIncomingRequests\(\)/);
  });

  it("returns 0 on any non-ok result (not-authed / needs-migration / failure)", () => {
    expect(src).toMatch(/if \(result\.kind !== "ok"\) return 0;/);
  });

  it("counts only OPEN ('sent') requests — terminal states are not pending", () => {
    expect(src).toMatch(/\.rows\.filter\(\(r\) => r\.status === "sent"\)\.length/);
  });
});

describe("the dashboard surfaces the request loop as a count-gated next action", () => {
  const page = read("app/[locale]/dashboard/page.tsx");

  it("computes the pending count via the marketplace helper", () => {
    // imported from the marketplace module (alone or alongside the buyer helper)
    expect(page).toMatch(/getPendingIncomingRequestCount/);
    expect(page).toMatch(/from "@\/lib\/marketplace\/service-requests"/);
    expect(page).toMatch(/const pendingServiceRequests = await getPendingIncomingRequestCount\(\);/);
  });

  it("renders the card ONLY when there is a real pending count (> 0)", () => {
    expect(page).toMatch(/pendingServiceRequests > 0 \?/);
    expect(page).toMatch(/data-testid="dashboard-service-requests-next-action"/);
  });

  it("links into the real request loop, never the doctrine-killed /discover", () => {
    expect(page).toMatch(/"\/dashboard\/service-requests" as "\/dashboard"/);
    expect(page).not.toMatch(/\/dashboard\/discover/);
  });

  it("is rendered in BOTH the org and worker overview branches", () => {
    // Org branch: mounted directly. Worker branch (audit PR6): either promoted
    // into the state-driven top slot or rendered in the remaining-states list.
    expect(page).toMatch(/\{serviceRequestsNextAction\}/);
    expect(page).toMatch(
      /topSlot !== "incoming_service_request" && serviceRequestsNextAction/,
    );
    expect(page).toMatch(/"incoming_service_request" \? \(\s*serviceRequestsNextAction/);
  });

  it("uses the real count in the badge (no hardcoded number)", () => {
    expect(page).toMatch(/\{pendingServiceRequests\}/);
  });
});

describe("dashboard badge i18n exists across active locales", () => {
  for (const loc of ["en", "lt", "ru"] as const) {
    it(`${loc} defines dashboardIncomingTitle + dashboardIncomingNote`, () => {
      const m = (JSON.parse(read(`messages/${loc}.json`)) as { marketplace?: Record<string, unknown> }).marketplace ?? {};
      for (const k of ["dashboardIncomingTitle", "dashboardIncomingNote"]) {
        expect(typeof m[k], `${loc}.${k}`).toBe("string");
        expect(String(m[k]).trim().length, `${loc}.${k}`).toBeGreaterThan(0);
      }
    });
  }
});
