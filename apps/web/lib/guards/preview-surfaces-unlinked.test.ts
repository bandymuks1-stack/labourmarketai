import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Preview-surface containment guard (admin-control-room-map-visual-v1).
 *
 * `talent` and `visual-os` are roadmap PREVIEW surfaces (sample/concept data,
 * honestly marked). They are kept in the codebase but must never be presented
 * as real product: no primary navigation, dashboard tile, account menu, admin
 * control room, or feature-catalogue entry may link to them. The only links
 * allowed are the previews' own internal cross-links.
 *
 * This pins the owner rule: "Do not expose preview/sample/roadmap surfaces as
 * if they are real product functionality" and "hidden preview/dead surfaces do
 * not reappear accidentally".
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

/** Navigation / entry-point surfaces a user (or admin) actually clicks. */
const NAV_SURFACES = [
  "components/app/bottom-nav.tsx",
  "components/app/dashboard-tabs.tsx",
  "components/app/account-menu.tsx",
  "components/app/identity-actions.tsx",
  "components/app/dashboard-chain-actions.tsx",
  "lib/config/navigation.ts",
  "lib/config/feature-availability.ts",
  "app/[locale]/dashboard/page.tsx",
  "app/[locale]/dashboard/admin/page.tsx",
];

// `/dashboard/learning` added 2026-07-02 (route-truth-map): the human-in-loop
// learning review surface works but is deliberately PARKED — zero inbound
// links until the owner decides its entry point (audit finding F-N1). Listing
// it here makes the parked state explicit and enforced instead of accidental.
const PREVIEW_ROUTES = [
  "/dashboard/talent",
  "/dashboard/visual-os",
  "/dashboard/learning",
];

describe("preview surfaces are not linked from any navigation entry point", () => {
  for (const rel of NAV_SURFACES) {
    if (!existsSync(join(ROOT, rel))) continue;
    const src = read(rel);
    for (const route of PREVIEW_ROUTES) {
      it(`${rel} does not link to ${route}`, () => {
        expect(
          src.includes(`"${route}"`) || src.includes(`${route}"`) || src.includes(`'${route}'`),
          `${rel} must not expose the preview route ${route}`,
        ).toBe(false);
      });
    }
  }
});

describe("preview surfaces stay out of the primary-nav catalogue", () => {
  it("market_map (real) is a primary feature but talent/visual-os are not nav features", () => {
    const nav = read("lib/config/navigation.ts");
    // Only the real product features appear in TAB_META; the previews never do.
    expect(nav).not.toMatch(/talent/i);
    expect(nav).not.toMatch(/visual[-_]?os/i);
  });
});

describe("preview surfaces remain honestly marked as not-live", () => {
  // If a preview page exists, it must carry an honest non-live marker so it is
  // never mistaken for a shipped feature (doctrine §18: "preview"/"concept"/
  // "not live yet"/"PRE-ALPHA" are the allowed honest markers).
  const HONEST = /preview|concept|not live yet|PRE-ALPHA|Sample|Pavyzd|Ruošiam|Концепт|превью/i;
  for (const rel of [
    "app/[locale]/dashboard/talent/page.tsx",
    "app/[locale]/dashboard/visual-os/page.tsx",
  ]) {
    if (!existsSync(join(ROOT, rel))) continue;
    it(`${rel} carries an honest preview marker`, () => {
      expect(read(rel)).toMatch(HONEST);
    });
  }
});
