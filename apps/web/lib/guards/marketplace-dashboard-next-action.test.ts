import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Train B — the marketplace request loop stays surfaced through an honest,
 * open-only pending count. Pins: the count helper (0 on any non-ok state,
 * only 'sent' counted), the notification spine carrying that count as the
 * canonical signal source, and the i18n keys in all three active locales.
 * The second-dashboard card that rendered it is gone (W3 Package 4).
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

describe("the notification spine carries the request-loop count (canonical signal source)", () => {
  it("the spine's pendingIncomingServiceRequests IS getPendingIncomingRequestCount()", () => {
    // W3 Package 4 deleted the second dashboard's card; the surviving
    // consumer is the spine (and its signals), so the count must still
    // trace to the canonical marketplace helper.
    const spine = read("lib/notifications/spine.ts");
    expect(spine).toMatch(/getPendingIncomingRequestCount\(\),/);
    expect(spine).toMatch(/pendingIncomingServiceRequests,/);
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
