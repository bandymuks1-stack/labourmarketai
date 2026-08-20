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
const stable = read("app/[locale]/stable-landing/stable-landing.tsx");
const switcher = read("app/[locale]/stable-landing/landing-mode-switcher.tsx");

/**
 * LIVE / FOCUS is a CONTROL COMPARISON, not a restyling.
 *
 *   LIVE  = the living European labour-market landing.
 *   FOCUS = the STABLE BASELINE — the previous production landing recovered
 *           from 7179882, the commit before #1221 deleted it.
 *
 * The earlier contract had FOCUS as a calmer presentation of the LIVE tree.
 * That made the experiment compare the new landing against itself. These
 * assertions pin the corrected contract: two real arms, one canonical URL,
 * chosen on the server so neither arm ships inside the other.
 */
describe("canonical landing LIVE / FOCUS experiment", () => {
  it("keeps one indexed landing and no mode-specific product surface", () => {
    expect(rootPage).toContain("LiveMarketLanding");
    expect(rootPage).toContain("StableLanding");
    expect(reviewPage).toContain("redirect(`/${locale}`)");
    expect(existsSync(join(WEB, "app", "[locale]", "live", "page.tsx"))).toBe(
      false,
    );
    expect(
      existsSync(join(WEB, "app", "[locale]", "focus", "page.tsx")),
    ).toBe(false);
    // The baseline is a component of the canonical route, never its own
    // indexable URL — a second landing surface would split the SEO identity.
    expect(
      existsSync(join(WEB, "app", "[locale]", "stable-landing", "page.tsx")),
    ).toBe(false);
  });

  it("resolves the arm on the server and defaults an unknown visitor to LIVE", () => {
    expect(rootPage).toContain("LANDING_MODE_COOKIE");
    expect(rootPage).toContain("cookies()");
    expect(rootPage).toContain('isLandingMode(value) ? value : "live"');
    expect(rootPage).toContain('mode === "focus"');
    // A crawler sends no cookie, so it renders LIVE — one indexed arm.
    expect(rootPage).toContain("buildPageMetadata");
  });

  it("persists only a bounded explicit choice, in both records", () => {
    expect(contract).toContain('LANDING_MODE_STORAGE_KEY = "lm.landing.mode"');
    expect(contract).toContain('LANDING_MODE_COOKIE = "lm_landing_mode"');
    expect(contract).toContain('value === "live" || value === "focus"');
    expect(contract).toContain("localStorage.setItem");
    expect(contract).toContain("document.cookie");
    expect(contract).toContain("samesite=lax");
    expect(command).toContain("persistLandingMode(nextMode)");
    expect(switcher).toContain("persistLandingMode(next)");
  });

  it("switches arms with a document load, since the server owns the choice", () => {
    expect(command).toContain("window.location.reload()");
    expect(switcher).toContain("window.location.reload()");
  });

  it("gives FOCUS the recovered baseline, not the LIVE composition", () => {
    for (const component of [
      "HeroLiveDemo",
      "ProductChainBand",
      "MarketProofBand",
      "PlayerCardShowcase",
      "TrustBand",
      "FinalCtaBand",
    ]) {
      expect(stable).toContain(component);
    }
    // The baseline's own chrome, as the (marketing) layout supplied it.
    expect(stable).toContain("SiteNav");
    expect(stable).toContain("SiteFooter");
    expect(stable).toContain("AmbientGlow");
    expect(stable).toContain('id="how-it-works"');
    // None of the LIVE art direction may leak into the control arm.
    expect(stable).not.toMatch(/world-(desktop|tablet|mobile)/);
    expect(stable).not.toContain("live-market-command");
    expect(stable).not.toContain("ACTIVITY_NODES");
    expect(stable).not.toContain("sectorTitle");
  });

  it("keeps the LIVE arm's switcher and primary navigation in its header", () => {
    expect(command).toContain('data-testid="landing-mode-switcher"');
    expect(command).toContain('aria-label="LIVE / FOCUS"');
    expect(command).toContain('href="/jobs"');
    expect(command).toContain('href="/for-workers"');
    expect(command).toContain('href="/for-companies"');
    expect(command).toContain('href="/auth/login"');
    expect(styles).toContain(".modeSwitcher");
    expect(styles).toContain("@media (max-width: 600px)");
    // …and gives the baseline arm a way back, or FOCUS is a one-way door.
    expect(switcher).toContain('data-testid="landing-mode-switcher"');
    expect(switcher).toContain('aria-label="LIVE / FOCUS"');
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
    expect(contract).toContain('"worker" | "employer" | "unknown"');
    expect(contract).toContain("return { mode, audience }");
    expect(telemetryAction).toContain('"mode"');
    expect(telemetryTask).toContain("readLandingMode()");
    expect(telemetryTask).toContain("enriched.mode = landingMode");
    expect(telemetryTask).toContain("locale: currentLocale()");
    // Both arms must report themselves, or the comparison has one side.
    expect(switcher).toContain("LANDING_EVENTS.modeSeen");
    expect(switcher).toContain("LANDING_EVENTS.modeChanged");
  });

  it("keeps both audiences and truthful live data on the LIVE arm", () => {
    expect(command).toContain('href="/auth/signup"');
    expect(command).toContain('href="/company-need"');
    expect(command).toContain("styles.supplyPanel");
    expect(command).toContain("market.activeVacancies");
    expect(command).toContain("market.distinctEmployers");
    expect(command).not.toContain("market.regions");
  });
});
