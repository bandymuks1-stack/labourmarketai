import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WEB = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(WEB, path), "utf8");
const exists = (path: string) => existsSync(join(WEB, path));
/** Source with comments stripped — these pins are about CODE, not prose. */
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const rootPage = read("app/[locale]/page.tsx");
const middlewareSource = code(read("middleware.ts"));
const telemetryTask = code(read("lib/telemetry/task.ts"));
const focus = read("app/[locale]/focus-landing/focus-landing.tsx");

/**
 * ONE LANDING (owner decision 2026-09-30).
 *
 * The landing used to have two alternative experiences behind one URL: FOCUS
 * for every visitor, and an optional LIVE living-market scene behind a
 * LIVE / FOCUS switcher, a mode cookie and a middleware rewrite. The owner
 * withdrew the LIVE presentation until LabourMarket.ai has enough real
 * demand, supply, availability, mobility and project signals to show a living
 * market honestly — the IDEA stays a product direction, and the shared real
 * data behind it stays. Nothing replaces the scene.
 *
 * This guard pins that decision (so no LIVE-only runtime, asset or rewrite
 * quietly returns to the landing bundle), that the shared market reader is
 * kept, and — carried over unchanged from the two-arm guard — every restored
 * landing section in the owner's order.
 */
describe("the landing has one arm", () => {
  it("keeps one indexed, static landing and no mode-specific surface", () => {
    expect(rootPage).toContain("FocusLanding");
    expect(rootPage).not.toContain("force-dynamic");
    expect(rootPage).toContain("export const revalidate = 300");
    expect(rootPage).not.toContain("cookies()");
    expect(exists("app/[locale]/live/page.tsx")).toBe(false);
    expect(exists("app/[locale]/focus/page.tsx")).toBe(false);
    expect(exists("app/[locale]/focus-landing/page.tsx")).toBe(false);
  });

  it("ships no LIVE arm: no route, no switcher, no mode contract, no scene images", () => {
    expect(exists("app/[locale]/live-market-review")).toBe(false);
    expect(exists("app/[locale]/focus-landing/landing-mode-switcher.tsx")).toBe(false);
    expect(exists("app/[locale]/focus-landing/landing-mode-switcher.module.css")).toBe(false);
    expect(exists("lib/telemetry/landing-experience.ts")).toBe(false);
    expect(exists("public/visuals/living-market")).toBe(false);
    expect(code(focus)).not.toContain("LandingModeSwitcher");
  });

  it("serves every visitor the same tree: the middleware rewrites nothing by mode", () => {
    expect(middlewareSource).not.toContain("LANDING_MODE_COOKIE");
    expect(middlewareSource).not.toContain("lm_landing_mode");
    expect(middlewareSource).not.toContain("live-market-review");
    expect(middlewareSource).not.toContain("landingMode");
  });

  it("stamps no landing mode on funnel events", () => {
    expect(telemetryTask).not.toContain("readLandingMode");
    expect(telemetryTask).not.toContain("landing-experience");
  });

  it("keeps the shared market reader: the withdrawal is the presentation, not the data", () => {
    expect(exists("lib/market/live-market-landing.ts")).toBe(true);
    expect(focus).toContain("readLiveMarketLandingSnapshot");
  });

  it("keeps every restored section, in the owner's window-11 order", () => {
    /**
     * THE SECTIONS ARE THE CONTRACT; THE ORDER IS A PRODUCT DECISION.
     *
     * This guard was written to prove FOCUS RESTORED the pre-#1221 landing
     * rather than recreating it from a screenshot, and the section list is
     * still exactly that guarantee: none of the restored bands may quietly
     * disappear. What changed on 2026-09-07 is that the owner opened the
     * frozen-landing contract for §§16–20, and the ORDER moved:
     *
     *   before  entry → chain → proof → card → trust → doors
     *   after   entry → MAP(+proof) → doors → chain → card → trust
     *
     * Two bands are new — `PublicMarketMapBand` (§17) and
     * `StartingContextsBand` (§20, the former `FinalCtaBand` reframed over the
     * SAME five doors from the same registry) — and `MarketProofBand` now
     * renders INSIDE the map band as its supporting evidence rather than as a
     * section of its own (§16). Every original component is still imported and
     * still rendered.
     *
     * 2026-09-23 (owner directives landing §22 + PUBLIC_LANDING_REAL_JOB_
     * DISCOVERY) ADDED three things and moved nothing:
     *
     *   hero + LandingPrimaryActions → entry → MAP(+proof) → OPEN JOBS
     *   → doors → chain → card → trust → LandingClosingBand
     *
     * The value copy lives in the hero's own keys, the one next step sits
     * under it and again at the end, and a few real vacancies follow the map.
     *
     * 2026-09-27 (owner decision) WITHDREW `PublicMarketMapBand` from the
     * landing. It could only draw MARKET_COUNTRIES centroids — never activity,
     * because the anon boundary publishes no country, region, city or
     * coordinate — and it therefore needed three lines of copy explaining what
     * its markers were NOT ("Tai rinkos, ne šios dienos veikla"). That is the
     * product explaining its data model to a visitor, which is banned.
     *
     * THE BAND IS REMOVED FROM THE LIST, NOT THE RULE. Its component file,
     * `<MarketMap>` and `publicCoverageView()` are untouched, and every OTHER
     * restored band is still pinned below. `MarketProofBand` stops being nested
     * inside it and becomes a section of its own again, now carrying the
     * `#market` anchor `site-nav.tsx` links to — so the withdrawal cost the
     * visitor no figures and no navigation.
     */
    for (const original of [
      "PublicEntry",
      "ProductChainBand",
      "MarketProofBand",
      "PlayerCardShowcase",
      "TrustBand",
      "StartingContextsBand",
      "LandingOpenJobsBand",
    ]) {
      expect(focus).toContain(
        `import { ${original} } from "@/components/marketing/`,
      );
    }
    expect(focus).toContain(
      'import { LandingPrimaryActions, LandingClosingBand } from "@/components/marketing/landing-primary-actions"',
    );
    // Code only — the file's own history may NAME the retired hero in prose.
    expect(code(focus)).not.toContain("HeroLiveDemo");
    const order = [
      "LandingPrimaryActions",
      "PublicEntry",
      "MarketProofBand",
      "LandingOpenJobsBand",
      "StartingContextsBand",
      "ProductChainBand",
      "PlayerCardShowcase",
      "TrustBand",
      "LandingClosingBand",
    ].map((c) => code(focus).search(new RegExp(`<${c}[\\s/>]`)));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // The next step is in the hero, BEFORE the entry — not inside it.
    expect(code(focus).match(/<LandingPrimaryActions[\s/>]/g) ?? []).toHaveLength(1);
    // Its chrome is the (marketing) layout's, reproduced — not approximated.
    expect(focus).toContain("<AmbientGlow />");
    expect(focus).toContain("<SiteNav />");
    expect(focus).toContain("<SiteFooter />");
    expect(focus).toContain("<MarketingFunnelBeacon />");
    expect(focus).toContain('id="main-content"');
    expect(focus).toContain("MARKETING_CLIENT_MESSAGE_ROOTS");
    // The historical wrapper + the #how-it-works anchor it carried.
    expect(focus).toContain(
      'className="mx-auto max-w-container px-6 py-14 sm:px-12"',
    );
    expect(focus).toContain('id="how-it-works"');
    expect(focus).toContain("provenance: 7179882");
  });
});
