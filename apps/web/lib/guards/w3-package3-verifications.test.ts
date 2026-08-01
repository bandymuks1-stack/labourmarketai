import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * W3 Package 3 — rows 20/22/23/27 verification pins (no port owed).
 *
 * - Row 20 (`CommandFinder`): the surviving presentation is the LAYOUT-level
 *   header-search overlay, mounted on every dashboard page. The advanced
 *   page's inline mount dies with the route.
 * - Row 22 (`PrivacyStatusCard`): a status DOOR (read + link) whose canonical
 *   destination `/dashboard/privacy` owns the capability. Dies with the route.
 * - Row 23 (`TelemetryView`): a generic product-wide telemetry component; the
 *   advanced mount is only that page's own view event.
 * - Row 27 (card preferences): preferences FOR the advanced card grid —
 *   removed together with the grid in Package 4.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

describe("row 20 — the command finder survives at the layout level", () => {
  it("header-search mounts CommandFinder and the dashboard layout mounts header-search", () => {
    expect(read("components/app/header-search.tsx")).toMatch(/<CommandFinder\s*\/?>/);
    expect(read("app/[locale]/dashboard/layout.tsx")).toMatch(/HeaderSearch|header-search/);
  });
});

describe("row 22 — the privacy card is a door onto the canonical privacy surface", () => {
  it("reads status, links /dashboard/privacy, writes nothing", () => {
    const src = read("components/app/privacy-status-card.tsx");
    expect(src).toMatch(/href="\/dashboard\/privacy"/);
    expect(src).not.toMatch(/<form|action=\{|\brpc\(/);
  });

  it("the canonical privacy surface exists and owns the real capability", () => {
    expect(existsSync(join(APP, "app/[locale]/dashboard/privacy/page.tsx"))).toBe(true);
    const page = read("app/[locale]/dashboard/privacy/page.tsx");
    expect(page).toMatch(/discoverability/i);
  });
});

describe("row 23 — TelemetryView is generic, not an advanced capability", () => {
  it("is consumed by many surfaces (spot-check two beyond the advanced page)", () => {
    expect(read("app/[locale]/dashboard/company/page.tsx")).toMatch(/TelemetryView/);
    expect(read("app/[locale]/dashboard/market-map/page.tsx")).toMatch(/TelemetryView/);
  });
});
