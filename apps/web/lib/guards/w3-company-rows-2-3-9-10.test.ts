import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * W3 rows 2/3/9/10 — the COMPANY package classification, pinned.
 *
 * Rows 9/10 (service-request next-actions) are `ALREADY`: their signals live
 * in the notification spine, which the LAYOUT-mounted bell presents — the
 * presentation that survives the /dashboard/advanced deletion. The canonical
 * surface is /dashboard/service-requests.
 *
 * Rows 2/3 (premium-hub company/project cards) were DOOR-PANELS: counts +
 * deep links only, no capability of their own. W3 Package 4 deleted them
 * with the route; what stays pinned is that every destination they pointed
 * at is a canonical surface that still exists.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

describe("rows 9/10 — the spine carries both service-request signals", () => {
  const signals = read("lib/notifications/spine-signals.ts");

  it("incoming-service-requests + service-request-responses exist with the canonical href", () => {
    for (const id of ["incoming-service-requests", "service-request-responses"]) {
      const at = signals.indexOf(`id: "${id}"`);
      expect(at, `${id} missing from the spine catalogue`).toBeGreaterThan(-1);
      const block = signals.slice(at, at + 300);
      expect(block).toMatch(/href:\s*"\/dashboard\/service-requests"/);
    }
  });

  it("the counts come from the ONE spine read model (no parallel count query)", () => {
    const spine = read("lib/notifications/spine.ts");
    expect(spine).toMatch(/pendingIncomingServiceRequests/);
    expect(spine).toMatch(/serviceRequestResponsesNew/);
  });

  it("the canonical clearing surface exists", () => {
    expect(read("app/[locale]/dashboard/service-requests/page.tsx")).toMatch(
      /data-testid="service-requests-page"/,
    );
  });
});

describe("rows 2/3 — the hub cards' destinations stay canonical", () => {
  // The door-panel cards themselves died with the route (W3 Package 4);
  // their per-file no-write pins went with them.
  it("the destinations the cards deep-linked are real canonical anchors/routes", () => {
    const company = read("app/[locale]/dashboard/company/page.tsx");
    expect(company).toMatch(/id="company-team"/);
    // The surviving spaces hub carries the company door (route-deletion safe).
    expect(read("app/[locale]/dashboard/start/page.tsx")).toMatch(
      /\/dashboard\/company/,
    );
  });
});
