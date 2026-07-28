import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Action truth audit (make-or-hide v1). Every visible action-like element must
 * be real (route/action), clearly disabled/future, info-only (not clickable),
 * or hidden. This guard pins the audited state: no dead links, no no-op
 * handlers, future/info elements not styled as active, and the stepper is
 * progress-only.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const ROOM_PAGES = [
  "app/[locale]/dashboard/page.tsx",
  "app/[locale]/dashboard/account/page.tsx",
  "app/[locale]/dashboard/profile/page.tsx",
  "app/[locale]/dashboard/buyer/page.tsx",
  "app/[locale]/dashboard/company/page.tsx",
  "app/[locale]/dashboard/journal/page.tsx",
] as const;

const ACTION_COMPONENTS = [
  "components/app/role-catalogue-card.tsx",
  "components/app/feature-availability-grid.tsx",
  "components/app/dashboard-chain-actions.tsx",
  "components/app/current-space-header.tsx",
  "components/app/demand-request-button.tsx",
] as const;

describe("no dead links / no-op handlers in rooms", () => {
  for (const rel of [...ROOM_PAGES, ...ACTION_COMPONENTS]) {
    const src = read(rel);
    it(`${rel} has no dead href="#"`, () => {
      // A BARE `href="#"` is a dead link. A real in-page anchor
      // (`href="#journal-composer"`, `href="#profile-edit"`) is legitimate
      // navigation to an element id — allow it; only flag the empty hash.
      expect(src).not.toMatch(/href=["'{]#["'\s}>]/);
    });
    it(`${rel} has no empty/no-op onClick`, () => {
      expect(src).not.toMatch(/onClick=\{\(\)\s*=>\s*(\{\s*\}|null|undefined)\}/);
    });
  }
});

describe("the journey stepper was removed (active-role overview)", () => {
  const page = read("app/[locale]/dashboard/page.tsx");
  // dashboard-active-role-overview-v1: the stage-rail no longer lives on the
  // overview; the first screen leads with one clear next action instead.
  it("no journey stage-rail remains on the overview", () => {
    expect(page).not.toMatch(/function JourneyRail/);
    expect(page).not.toMatch(/<nav aria-label=\{label\}/);
  });
});

describe("future / preparing cards are not styled as active actions", () => {
  it("role + feature cards keep a flat inactive variant (no hover) for preparing", () => {
    const role = read("components/app/role-catalogue-card.tsx");
    const feat = read("components/app/feature-availability-grid.tsx");
    expect(role).toMatch(/border-ink-600 bg-ink-800\/30/);
    expect(feat).toMatch(/border-ink-600 bg-ink-800\/30/);
  });
  it("the preparing CTA is conditional, never unconditional", () => {
    const role = read("components/app/role-catalogue-card.tsx");
    expect(role).toMatch(/hasHonestStartPath && ctaRoute \?/);
  });
});

describe("info-only cards do not look clickable", () => {
  for (const rel of [
    "components/app/manager-evidence-card.tsx",
    "components/app/worker-readiness-summary.tsx",
  ]) {
    it(`${rel} has no pointer cursor / hover-button on the card`, () => {
      const src = read(rel);
      expect(src).not.toMatch(/cursor-pointer|hover:border-brand|hover:bg-brand/);
    });
  }
});

describe("room boundaries preserved (regression)", () => {
  it("/dashboard stays focused; account is settings only (no cross-space catalogue)", () => {
    const dash = read("app/[locale]/dashboard/page.tsx");
    const account = read("app/[locale]/dashboard/account/page.tsx");
    expect(dash).not.toMatch(/<RoleCatalogueGrid\b|<FeatureAvailabilityGrid\b/);
    expect(account).not.toMatch(/<RoleCatalogueGrid\b/);
    expect(account).not.toMatch(/<FeatureAvailabilityGrid\b/);
  });
  it("buyer presents no worker as purchasable", () => {
    const buyer = JSON.stringify(JSON.parse(read("messages/lt.json")).roleDashboards.buyer);
    expect(buyer).not.toMatch(/darbuotoj|pirkti darbuotoj/i);
  });
});
