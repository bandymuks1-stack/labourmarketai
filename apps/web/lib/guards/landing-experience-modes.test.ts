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

describe("canonical landing LIVE / FOCUS experiment", () => {
  it("keeps one indexed landing and no mode-specific product surface", () => {
    expect(rootPage).toContain("LiveMarketLanding");
    expect(reviewPage).toContain("redirect(`/${locale}`)");
    expect(existsSync(join(WEB, "app", "[locale]", "live", "page.tsx"))).toBe(
      false,
    );
    expect(
      existsSync(join(WEB, "app", "[locale]", "focus", "page.tsx")),
    ).toBe(false);
  });

  it("defaults to LIVE and persists only a bounded explicit choice", () => {
    expect(command).toContain('useState<LandingMode>("live")');
    expect(command).toContain('readLandingMode() ?? "live"');
    expect(command).toContain("persistLandingMode(nextMode)");
    expect(contract).toContain('LANDING_MODE_STORAGE_KEY = "lm.landing.mode"');
    expect(contract).toContain('value === "live" || value === "focus"');
  });

  it("exposes the switcher and all primary navigation in the shared header", () => {
    expect(command).toContain('data-testid="landing-mode-switcher"');
    expect(command).toContain('aria-label="LIVE / FOCUS"');
    expect(command).toContain('href="/jobs"');
    expect(command).toContain('href="/for-workers"');
    expect(command).toContain('href="/for-companies"');
    expect(command).toContain('href="/auth/login"');
    expect(styles).toContain(".modeSwitcher");
    expect(styles).toContain("@media (max-width: 600px)");
  });

  it("does not mount or run the LIVE workload while FOCUS is active", () => {
    expect(command).toContain(
      'const liveWorkloadActive = modeReady && mode === "live"',
    );
    expect(command).toContain('data-live-workload={liveWorkloadActive}');
    expect(command).toContain(
      "onPointerMove={liveWorkloadActive ? handlePointerMove : undefined}",
    );
    expect(command).toContain(
      "if (!liveWorkloadActive || reducedMotion || !pageVisible) return",
    );
    expect(command).toMatch(/\{liveWorkloadActive \? \([\s\S]*styles\.motionLayer/);
    expect(styles).toContain('.root[data-mode="focus"]');
  });

  it("uses one responsive visual asset family for both modes", () => {
    expect(command.match(/world-desktop\.webp/g)).toHaveLength(1);
    expect(command.match(/world-tablet\.webp/g)).toHaveLength(1);
    expect(command.match(/world-mobile\.webp/g)).toHaveLength(1);
    expect(command).not.toMatch(/focus-(desktop|tablet|mobile)/);
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
  });

  it("keeps both audiences, jobs and truthful data on both presentations", () => {
    expect(command).toContain('href="/auth/signup"');
    expect(command).toContain('href="/company-need"');
    expect(command).toContain("styles.supplyPanel");
    expect(command).toContain("market.activeVacancies");
    expect(command).toContain("market.distinctEmployers");
    expect(command).toContain("market.regions");
    expect(styles).toContain('.root[data-mode="focus"] .supplyPanel');
  });
});
