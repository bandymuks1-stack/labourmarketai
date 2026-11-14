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
    // LANDING V3 (owner-approved structure, 2026-11-13) SUPERSEDES the
    // window-11 list of bands. The owner looked at the live page on a phone
    // — eleven screens, four role choices, two chains, numbers twice — and
    // approved three blocks instead of ten. The product chain, the trust
    // band, the starting contexts, the two-sides lifecycle and the closing
    // band left the PAGE (their components stay in the repository); the
    // market figures, the real adverts and the sentence entry stayed, in
    // their one place each. What is pinned now is that V3 composition.
    for (const [symbol, from] of [
      ["PublicEntry", "@/components/marketing/public-entry"],
      ["LandingOpenJobsBand", "@/components/marketing/landing-open-jobs-band"],
      ["LandingIntentChoice", "@/components/marketing/landing-intent-choice"],
    ] as const) {
      expect(focus).toContain(`import { ${symbol} } from "${from}"`);
    }
    expect(focus).toContain(
      'import { LandingHow, LandingMarketFacts, LandingNeedPath } from "@/components/marketing/landing-v3"',
    );
    // One of each, in the approved order: goals → sentence → request →
    // market → how it works.
    const at = (tag: string) => code(focus).indexOf(`<${tag}`);
    const order = ["LandingIntentChoice", "PublicEntry", "LandingNeedPath", "LandingMarketFacts", "LandingHow"];
    for (const tag of order) expect(code(focus).split(`<${tag}`).length - 1, tag).toBe(1);
    expect(order.map(at)).toEqual([...order.map(at)].sort((a, b) => a - b));
    // The sections the owner removed are not mounted again by accident.
    for (const gone of ["ProductChainBand", "TrustBand", "StartingContextsBand", "TwoSidesSection", "LandingClosingBand", "MarketProofBand"]) {
      expect(code(focus), gone).not.toContain(`<${gone}`);
    }
    // Code only — the file's own history may NAME the retired hero in prose.
    expect(code(focus)).not.toContain("HeroLiveDemo");
    // The next step is in the hero, BEFORE the entry — not inside it.
    expect(code(focus).match(/<LandingIntentChoice[\s/>]/g) ?? []).toHaveLength(1);
    expect(code(focus).match(/<LandingPrimaryActions[\s/>]/g) ?? []).toHaveLength(0);
    // Its chrome is the (marketing) layout's, reproduced — not approximated.
    expect(focus).toContain("<AmbientGlow />");
    // The landing shows the six goals as cards, so its header bar does not
    // repeat them (owner gate 2026-11-12: no duplicated main menu).
    expect(focus).toContain("<SiteNav goalsOnPage />");
    // The home page footer carries only the necessary legal links (V3).
    expect(focus).toContain("<SiteFooter compact />");
    expect(focus).toContain("<MarketingFunnelBeacon />");
    expect(focus).toContain('id="main-content"');
    // The landing ships its own, smaller client pick (2026-11-12).
    expect(focus).toContain("pickLandingMessages(await getMessages())");
    // The wrapper; its bottom padding shrank with V3's shorter page.
    expect(focus).toContain(
      'className="mx-auto max-w-container px-4 pb-10 pt-5 sm:px-12 sm:pt-10"',
    );
    // The #how-it-works anchor the header links to is on the compact block.
    expect(focus).toMatch(/<LandingHow\s*\/>/);
  });
});
