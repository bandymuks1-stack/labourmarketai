import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WEB = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(WEB, path), "utf8");

const command = read(
  "app/[locale]/live-market-review/live-market-command.tsx",
);
const styles = read(
  "app/[locale]/live-market-review/live-market-command.module.css",
);
const contract = read("lib/telemetry/landing-experience.ts");
const telemetryAction = read("lib/telemetry/actions.ts");
const telemetryTask = read("lib/telemetry/task.ts");
const rootPage = read("app/[locale]/page.tsx");
const reviewPage = read("app/[locale]/live-market-review/page.tsx");
const focus = read("app/[locale]/focus-landing/focus-landing.tsx");
const focusSwitcher = read(
  "app/[locale]/focus-landing/landing-mode-switcher.tsx",
);
const focusSwitcherStyles = read(
  "app/[locale]/focus-landing/landing-mode-switcher.module.css",
);

/**
 * LIVE / FOCUS — two ALTERNATIVE landing experiences behind one URL.
 *
 * FOCUS is no longer a calmer restyling of the LIVE tree (which made the
 * comparison a landing against itself). It is the previous production
 * landing, restored from `(marketing)/page.tsx` at 7179882 — the commit
 * immediately before #1221 deleted it. This guard pins that separation.
 */
describe("canonical landing LIVE / FOCUS experiences", () => {
  it("keeps one indexed landing and no mode-specific product surface", () => {
    expect(rootPage).toContain("LiveMarketLanding");
    expect(rootPage).toContain("FocusLanding");
    expect(reviewPage).toContain("redirect(`/${locale}`)");
    expect(existsSync(join(WEB, "app", "[locale]", "live", "page.tsx"))).toBe(
      false,
    );
    expect(existsSync(join(WEB, "app", "[locale]", "focus", "page.tsx"))).toBe(
      false,
    );
    // FOCUS is a component tree the canonical page mounts, never a route of
    // its own — a second landing URL would be a duplicate SEO surface.
    expect(
      existsSync(join(WEB, "app", "[locale]", "focus-landing", "page.tsx")),
    ).toBe(false);
  });

  it("resolves the arm on the SERVER so only one landing is shipped", () => {
    expect(rootPage).toContain("LANDING_MODE_COOKIE");
    expect(rootPage).toContain('isLandingMode(value) ? value : "live"');
    expect(rootPage).toMatch(/mode === "focus" \? \(\s*<FocusLanding/);
    expect(contract).toContain('LANDING_MODE_COOKIE = "lm_landing_mode"');
    // localStorage stays the persistence record; the cookie only lets the
    // server learn it. Both are bounded to the two literal modes.
    expect(contract).toContain('LANDING_MODE_STORAGE_KEY = "lm.landing.mode"');
    expect(contract).toContain('value === "live" || value === "focus"');
    expect(contract).toContain("samesite=lax");
  });

  it("defaults an unknown visitor and every crawler to LIVE", () => {
    expect(command).toContain('useState<LandingMode>("live")');
    // A crawler sends no cookie, so the fallback IS the indexed landing.
    expect(rootPage).toContain('return isLandingMode(value) ? value : "live"');
  });

  it("switches by reloading into the other tree, never by restyling", () => {
    for (const source of [command, focusSwitcher]) {
      expect(source).toContain("persistLandingMode");
      expect(source).toContain("window.location.reload()");
      expect(source).toContain('data-testid="landing-mode-switcher"');
      expect(source).toContain('aria-label="LIVE / FOCUS"');
    }
    expect(styles).toContain(".modeSwitcher");
    expect(focusSwitcherStyles).toContain(".modeSwitcher");
    expect(focusSwitcherStyles).toContain("@media (max-width: 600px)");
  });

  it("never runs the LIVE workload outside the LIVE tree", () => {
    expect(command).toContain(
      'const liveWorkloadActive = modeReady && mode === "live"',
    );
    expect(command).toContain("data-live-workload={liveWorkloadActive}");
    expect(command).toContain(
      "onPointerMove={liveWorkloadActive ? handlePointerMove : undefined}",
    );
    expect(command).toContain(
      "if (!liveWorkloadActive || reducedMotion || !pageVisible) return",
    );
    // FOCUS is a separate tree, so it cannot reach the LIVE runtime at all.
    expect(focus).not.toMatch(/live-market-(command|page)/);
    expect(focus).not.toMatch(/world-(desktop|tablet|mobile)\.webp/);
  });

  it("restores the previous production landing rather than recreating it", () => {
    // The six components of `(marketing)/page.tsx` at 7179882, in its order.
    for (const original of [
      "HeroLiveDemo",
      "ProductChainBand",
      "MarketProofBand",
      "PlayerCardShowcase",
      "TrustBand",
      "FinalCtaBand",
    ]) {
      expect(focus).toContain(
        `import { ${original} } from "@/components/marketing/`,
      );
    }
    const order = [
      "HeroLiveDemo",
      "ProductChainBand",
      "MarketProofBand",
      "PlayerCardShowcase",
      "TrustBand",
      "FinalCtaBand",
    ].map((c) => focus.indexOf(`<${c} />`));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
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

  it("emits the five typed, PII-free mode-aware events through pilot telemetry", () => {
    for (const event of [
      "landing_mode_seen",
      "landing_mode_changed",
      "landing_primary_cta_clicked",
      "landing_jobs_opened",
      "landing_signup_started",
    ]) {
      expect(contract).toContain(event);
    }
    expect(command).toContain("LANDING_EVENTS.modeSeen");
    expect(command).toContain("LANDING_EVENTS.modeChanged");
    expect(command).toContain("LANDING_EVENTS.primaryCtaClicked");
    expect(command).toContain("LANDING_EVENTS.jobsOpened");
    expect(command).toContain("LANDING_EVENTS.signupStarted");
    expect(focusSwitcher).toContain("LANDING_EVENTS.modeSeen");
    expect(focusSwitcher).toContain("LANDING_EVENTS.modeChanged");
    expect(contract).toContain('"worker" | "employer" | "unknown"');
    expect(contract).toContain("return { mode, audience }");
    expect(telemetryAction).toContain('"mode"');
    expect(telemetryTask).toContain("readLandingMode()");
    expect(telemetryTask).toContain("enriched.mode = landingMode");
    expect(telemetryTask).toContain("locale: currentLocale()");
  });

  it("keeps both audiences, jobs and truthful data on the LIVE tree", () => {
    expect(command).toContain('href="/auth/signup"');
    expect(command).toContain('href="/company-need"');
    expect(command).toContain('href="/jobs"');
    expect(command).toContain('href="/for-workers"');
    expect(command).toContain('href="/for-companies"');
    expect(command).toContain('href="/auth/login"');
    expect(command).toContain("styles.supplyPanel");
    expect(command).toContain("market.activeVacancies");
    expect(command).toContain("market.distinctEmployers");
    // `regions` was a static coverage fact, not a live count from the public
    // vacancy contract, so it may not sit inside VERIFIED MARKET DATA.
    expect(command).not.toContain("market.regions");
  });

  it("uses one responsive visual asset family on the LIVE tree", () => {
    expect(command.match(/world-desktop\.webp/g)).toHaveLength(1);
    expect(command.match(/world-tablet\.webp/g)).toHaveLength(1);
    expect(command.match(/world-mobile\.webp/g)).toHaveLength(1);
    expect(command).not.toMatch(/focus-(desktop|tablet|mobile)/);
  });
});
