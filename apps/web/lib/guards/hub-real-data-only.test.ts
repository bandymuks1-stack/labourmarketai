import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Premium Hub — real-data-only guard (premium-hub real-data wiring v1).
 *
 * The premium hub — now the canonical `/dashboard` lead surface (dashboard
 * consolidation v1; the former `/dashboard/hub` route was removed) — must be
 * backed by real RLS-scoped data, never by concept fixtures. This pins that
 * contract so it cannot silently regress back into a "pretty preview":
 *
 *  A. The concept fixture module is gone (deleted, not merely unused).
 *  B. No hub product file references `PREMIUM_HUB_PREVIEW` or the fixtures module.
 *  C. The canonical /dashboard page fetches the real view model
 *     (`getPremiumHubViewModel`).
 *  D. The screen renders from a `PremiumHubViewModel`, not a hardcoded payload.
 */

const ROOT = join(__dirname, "..", "..");
const HUB_DIR = join(ROOT, "components", "app", "premium-hub");
const PAGE = join(ROOT, "app", "[locale]", "dashboard", "advanced", "page.tsx");
const read = (p: string) => readFileSync(p, "utf8");

describe("premium hub is backed by real data, never concept fixtures", () => {
  it("A. the concept fixture module no longer exists", () => {
    expect(existsSync(join(HUB_DIR, "premium-hub-fixtures.ts"))).toBe(false);
  });

  it("B. no hub product file references the preview fixture", () => {
    const offenders: string[] = [];
    for (const f of readdirSync(HUB_DIR)) {
      if (!/\.(ts|tsx)$/.test(f) || /\.test\.tsx?$/.test(f)) continue;
      const src = read(join(HUB_DIR, f));
      if (src.includes("PREMIUM_HUB_PREVIEW") || src.includes("premium-hub-fixtures")) {
        offenders.push(f);
      }
    }
    const pageSrc = read(PAGE);
    if (
      pageSrc.includes("PREMIUM_HUB_PREVIEW") ||
      pageSrc.includes("premium-hub-fixtures")
    ) {
      offenders.push("app/[locale]/dashboard/advanced/page.tsx");
    }
    expect(offenders, `fixture references found in: ${offenders.join(", ")}`).toEqual(
      [],
    );
  });

  it("C. the route fetches the real RLS-scoped view model", () => {
    const pageSrc = read(PAGE);
    expect(pageSrc).toMatch(/getPremiumHubViewModel/);
    expect(pageSrc).toMatch(/premium-hub-data/);
  });

  it("D. the screen renders from a PremiumHubViewModel prop", () => {
    const screen = read(join(HUB_DIR, "premium-hub-screen.tsx"));
    expect(screen).toMatch(/PremiumHubViewModel/);
  });
});
