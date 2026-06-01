import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Clickable affordance polish (v1). After the Ramūnas review ("not always clear
 * what can be tapped"): real actions must look tappable, info-only / future
 * cards must not. Pins the cues without changing the room IA.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const ROOMS = ["buyer", "company", "profile", "agency", "journal"] as const;

describe("room 'My spaces' switch is an unmistakable tappable chip", () => {
  for (const r of ROOMS) {
    const src = read(`app/[locale]/dashboard/${r}/page.tsx`);
    it(`${r} My-spaces link is a bordered chip, not a plain underline`, () => {
      // The link region carries the bordered-chip cue.
      expect(src).toMatch(/data-testid="room-my-spaces-link"/);
      expect(src).toMatch(/room-my-spaces-link[\s\S]{0,160}rounded-md border border-brand-blue\/40|rounded-md border border-brand-blue\/40[\s\S]{0,160}room-my-spaces-link/);
      // …and not the old plain-underline-only treatment.
      expect(src).not.toMatch(/room-my-spaces-link[\s\S]{0,80}text-brand-blue hover:underline"/);
    });
  }
});

describe("navigational catalogue cards expose a clear action cue (chevron + hover)", () => {
  it("active role card renders a CTA with a chevron, gated on an honest start path", () => {
    const src = read("components/app/role-catalogue-card.tsx");
    expect(src).toMatch(/hasHonestStartPath[\s\S]{0,120}hover:border-brand-blue/);
    expect(src).toMatch(/role-catalogue-card-\$\{role\.id\}-cta/);
    expect(src).toMatch(/→/);
  });
});

describe("info-only / future cards do not look tappable", () => {
  it("preparing role/feature cards have no hover affordance", () => {
    const role = read("components/app/role-catalogue-card.tsx");
    const feat = read("components/app/feature-availability-grid.tsx");
    // The inactive branch is a flat border with no hover.
    expect(role).toMatch(/border-ink-600 bg-ink-800\/30/);
    expect(feat).toMatch(/border-ink-600 bg-ink-800\/30/);
  });
  it("info-only cards have no pointer/hover-button on the card itself", () => {
    for (const rel of [
      "components/app/manager-evidence-card.tsx",
      "components/app/worker-readiness-summary.tsx",
      "components/app/profile-cv-clarity-card.tsx",
    ]) {
      const src = read(rel);
      expect(src, rel).not.toMatch(/cursor-pointer|hover:border-brand|hover:bg-brand/);
    }
  });
});

describe("room IA preserved (regression guard)", () => {
  it("/dashboard stays focused (no catalogue/future-grid)", () => {
    const dash = read("app/[locale]/dashboard/page.tsx");
    expect(dash).not.toMatch(/<RoleCatalogueGrid\b/);
    expect(dash).not.toMatch(/<FeatureAvailabilityGrid\b/);
  });
  it("the cross-space catalogue stays only under /dashboard/account", () => {
    const account = read("app/[locale]/dashboard/account/page.tsx");
    expect(account).toMatch(/<RoleCatalogueGrid\b/);
    expect(account).toMatch(/<FeatureAvailabilityGrid\b/);
  });
  it("buyer copy presents no worker as purchasable", () => {
    const buyer = JSON.stringify(JSON.parse(read("messages/lt.json")).roleDashboards.buyer);
    expect(buyer).not.toMatch(/darbuotoj|pirkti darbuotoj/i);
  });
});
