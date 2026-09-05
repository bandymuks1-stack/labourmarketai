import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WEB = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(WEB, path), "utf8");
/** Source with comments stripped — these pins are about CODE, not prose. */
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

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
const middlewareSource = read("middleware.ts");
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
 * FOCUS is the previous production landing, restored from
 * `(marketing)/page.tsx` at 7179882 — the commit immediately before #1221
 * deleted it — and, since owner command 2026-08-22, the PRIMARY landing:
 * every visitor without an explicit choice receives it. LIVE is the optional
 * interactive experience, reachable only by explicitly selecting it.
 *
 * This guard pins the separation, the default, and the two properties that
 * make the default trustworthy: persistence is written ONLY by an explicit
 * click, and the LIVE control carries a discovery signal that survives
 * reduced motion.
 */
describe("canonical landing LIVE / FOCUS experiences", () => {
  it("keeps one indexed landing and no mode-specific product surface", () => {
    // P0 entry-point fix 2026-08-31: the canonical page mounts FOCUS (the
    // default) and is STATIC; the LIVE tree lives behind the cookie-gated
    // internal route the middleware rewrites to. Still one indexed URL:
    // the review route redirects every visitor without the explicit-choice
    // cookie and its canonical metadata points at the root landing.
    expect(rootPage).toContain("FocusLanding");
    expect(rootPage).not.toContain("force-dynamic");
    expect(reviewPage).toContain("LiveMarketLanding");
    expect(reviewPage).toContain("redirect(`/${locale}`)");
    expect(reviewPage).toContain('buildPageMetadata({ locale, path: "" })');
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
    // The arm decision moved from the page to the MIDDLEWARE (still server
    // side, still one shipped tree): an explicit "live" cookie rewrites the
    // locale root to the LIVE route; everyone else gets the static FOCUS
    // page, so a fresh visit never waits on a serverless invocation.
    expect(middlewareSource).toContain("LANDING_MODE_COOKIE");
    expect(middlewareSource).toContain('landingMode === "live"');
    expect(middlewareSource).toContain("live-market-review");
    expect(middlewareSource).toContain("NextResponse.rewrite(liveUrl)");
    // The static default: an ISR window equal to the market snapshot's own
    // freshness (300 s), and no per-request state read on the root page.
    expect(rootPage).toContain("export const revalidate = 300");
    expect(rootPage).not.toContain("cookies()");
    // The LIVE route is the one place the cookie gate lives now.
    expect(reviewPage).toContain("LANDING_MODE_COOKIE");
    expect(reviewPage).toMatch(/mode !== "live"/);
    expect(contract).toContain('LANDING_MODE_COOKIE = "lm_landing_mode"');
    // localStorage stays the persistence record; the cookie only lets the
    // server learn it. Both are bounded to the two literal modes.
    expect(contract).toContain('LANDING_MODE_STORAGE_KEY = "lm.landing.mode"');
    expect(contract).toContain('value === "live" || value === "focus"');
    expect(contract).toContain("samesite=lax");
  });

  it("defaults an unknown visitor and every crawler to FOCUS", () => {
    // The fallback IS the whole default mechanism: no cookie, no explicit
    // choice, therefore FOCUS. A crawler sends no cookie, so the indexed
    // landing is the same one a fresh human gets.
    // The root page reads NO per-visitor state at all — absence of the read
    // IS the default mechanism now: no cookie consulted, FOCUS rendered,
    // crawler and fresh human byte-identical. The middleware rewrite fires
    // only on the exact explicit value, and the LIVE route re-checks it.
    expect(rootPage).not.toContain("LANDING_MODE_COOKIE");
    expect(rootPage).not.toContain("cookies()");
    expect(middlewareSource).toContain('landingMode === "live"');
    expect(reviewPage).toContain('mode !== "live"');
    // No heuristic may override it — nothing may branch on device, locale,
    // geography or user agent to pick an arm.
    const rootCode = code(rootPage);
    for (const heuristic of [
      "userAgent",
      "navigator.",
      "matchMedia",
      "headers(",
      "isMobile",
      "geolocation",
    ]) {
      expect(rootCode, heuristic).not.toContain(heuristic);
    }
    // Reaching the LIVE tree already means LIVE was explicitly chosen.
    expect(command).toContain('useState<LandingMode>("live")');
  });

  it("persists ONLY an explicit choice, so the default stays honest", () => {
    // Neither arm may write the record on mount: doing so would forge an
    // explicit choice for a visitor who merely arrived, and would make a real
    // LIVE choice indistinguishable from the old automatic default.
    for (const source of [command, focusSwitcher]) {
      expect(source).not.toMatch(
        /useEffect\([\s\S]{0,400}?persistLandingMode\(\s*"(live|focus)"\s*\)/,
      );
    }
    // The only writer is the explicit handler.
    expect(command).toContain("persistLandingMode(nextMode)");
    expect(focusSwitcher).toContain("persistLandingMode(next)");
    expect(focusSwitcher).toContain('if (next === "focus") return;');
  });

  it("gives LIVE a restrained discovery signal on the FOCUS landing", () => {
    // The switch itself is the invitation — never a popup, banner or toast,
    // and never a word added to the restored composition.
    expect(focusSwitcher).toContain("styles.liveDot");
    expect(focusSwitcher).toContain('candidate === "live"');
    expect(focusSwitcherStyles).toContain(".liveDot");
    expect(focusSwitcherStyles).toContain("live-dot-breathe");
    expect(focusSwitcherStyles).toContain("live-dot-attention");
    // Bounded attention: a finite iteration count, never `infinite`.
    expect(focusSwitcherStyles).toMatch(
      /animation: live-dot-attention [^;]*\s\d+;/,
    );
    const switcherCode = code(focusSwitcher).toLowerCase();
    for (const banned of ["dialog", "modal", "toast", "banner", "tooltip"]) {
      expect(switcherCode, banned).not.toContain(banned);
    }
    // The restored landing must not gain LIVE advertising copy.
    expect(focus).not.toMatch(/try live|discover live|new:/i);
  });

  it("keeps the signal accessible without motion", () => {
    expect(focusSwitcherStyles).toContain(
      "@media (prefers-reduced-motion: reduce)",
    );
    const reduced = focusSwitcherStyles.slice(
      focusSwitcherStyles.indexOf("@media (prefers-reduced-motion: reduce)"),
    );
    expect(reduced).toContain("animation: none");
    // The dot itself is never hidden — it is the static status indicator.
    expect(reduced).not.toMatch(/\.liveDot[^}]*display:\s*none/);
    // Keyboard affordances survive the transparent control.
    expect(focusSwitcherStyles).toContain(":focus-visible");
    expect(focusSwitcherStyles).toContain("outline");
    // The floor is measured on the BUTTON rule, not on a container that
    // merely happens to be tall enough.
    const buttonRule = focusSwitcherStyles.slice(
      focusSwitcherStyles.indexOf(".modeSwitcher button {"),
    );
    expect(buttonRule.slice(0, buttonRule.indexOf("}"))).toMatch(
      /min-height: 44px/,
    );
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
    // The six sections of `(marketing)/page.tsx` at 7179882, in its order.
    // The first — the scripted <HeroLiveDemo> scenario — was replaced by
    // <PublicEntry> under the owner's frozen design contract (2026-09-05,
    // package P1: the entry reads a REAL sentence through the one router);
    // the other five are the originals, in the original order.
    for (const original of [
      "PublicEntry",
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
    // Code only — the file's own history may NAME the retired hero in prose.
    expect(code(focus)).not.toContain("HeroLiveDemo");
    const order = [
      "PublicEntry",
      "ProductChainBand",
      "MarketProofBand",
      "PlayerCardShowcase",
      "TrustBand",
      "FinalCtaBand",
    ].map((c) => focus.search(new RegExp(`<${c}[\\s/>]`)));
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
