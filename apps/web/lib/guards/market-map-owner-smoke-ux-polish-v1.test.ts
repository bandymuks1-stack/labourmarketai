import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Market Map owner smoke + UX polish v1 guard (post-#462).
 *
 * Locks the product-quality fixes for the logged-in OWNER view:
 *   - every visibility control shows LOCALIZED copy, never a raw enum token;
 *   - the "my signals" CTAs whose control lives ON the map page scroll to it
 *     (preferred add / login consent) instead of navigating away;
 *   - no forbidden / fake / "coming later" framing in any Market Map UI string;
 *   - the owner architecture is unchanged: owner-only getOwnMarketSignals, no
 *     public/cross-user aggregate, no service_role / RPC / SECURITY DEFINER,
 *     no new DB migration, and login stays approximate (no lat/lng/address).
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

const CAPTURE = read("components/app/market-map-capture.tsx");
const MY_SIGNALS = read("components/app/market-map-my-signals.tsx");
const SHELL = read("components/app/market-map-shell.tsx");
const SIGNALS = read("lib/market-map/signals.ts");
const LOCALES = ["lt", "en", "ru"] as const;

// Strip line + block comments so guards check shipped copy, not annotations.
// CRLF-safe (.split(/\r?\n/) — a bare \r left by "\n" defeats /--.*$/ et al).
function stripComments(src: string): string {
  return src
    .split(/\r?\n/)
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("visibility controls show localized copy, never raw enum tokens", () => {
  it("the demand visibility <select> renders t(`visibility.${v}`)", () => {
    // The list of demand visibilities is still raw values, but each OPTION
    // label must be translated — not the bare token printed to the user.
    expect(CAPTURE).toMatch(/visibility\.\$\{v\}/);
    // No option that prints the raw enum string directly as its label.
    expect(CAPTURE).not.toMatch(/<option key=\{v\} value=\{v\}>\{v\}<\/option>/);
  });
  it("visibility.company_only exists in every locale (was missing pre-polish)", () => {
    for (const loc of LOCALES) {
      const vis = JSON.parse(read(`messages/${loc}.json`)).marketMap.capture.visibility;
      expect(vis.company_only, `${loc} visibility.company_only`).toBeTruthy();
    }
  });
});

describe("on-page CTAs scroll to the capture control (no navigate-away)", () => {
  it("preferred + login signal CTAs use the on-page anchors", () => {
    expect(MY_SIGNALS).toContain("#market-map-add-preferred");
    expect(MY_SIGNALS).toContain("#market-map-login-consent");
  });
  it("the capture sections carry the matching anchor ids", () => {
    expect(CAPTURE).toContain('id="market-map-add-preferred"');
    expect(CAPTURE).toContain('id="market-map-login-consent"');
  });
});

describe("copy guard — no fake / placeholder framing in Market Map UI", () => {
  const FORBIDDEN = [
    /\bfake\b/i,
    /netikr/i, // netikri / netikri taškai
    /kol kas tuščias/i,
    /realūs duomenys turės vietos lauką/i,
    /\bruošiama\b/i,
    /bus vėliau/i,
    /coming.?soon/i,
  ];
  it("the three Market Map components contain no forbidden terms", () => {
    const ui = stripComments(CAPTURE) + stripComments(MY_SIGNALS);
    for (const re of FORBIDDEN) expect(ui, re.source).not.toMatch(re);
  });
  it("the marketMap i18n bundle contains no forbidden terms", () => {
    for (const loc of LOCALES) {
      const mm = JSON.stringify(JSON.parse(read(`messages/${loc}.json`)).marketMap);
      for (const re of FORBIDDEN) expect(mm, `${loc} ${re.source}`).not.toMatch(re);
    }
  });
});

describe("architecture unchanged — owner-only, no public aggregate", () => {
  it("the shell still drives the owner view from getOwnMarketSignals", () => {
    expect(SHELL).toMatch(/getOwnMarketSignals/);
  });
  it("the owner UI never references the public/cross-user aggregate", () => {
    expect(MY_SIGNALS).not.toMatch(/\bmarketSignals\b/);
    expect(CAPTURE).not.toMatch(/\bmarketSignals\b/);
  });
  it("no service_role / RPC / SECURITY DEFINER in the Market Map surface", () => {
    for (const src of [CAPTURE, MY_SIGNALS, SHELL, SIGNALS]) {
      expect(src).not.toMatch(/service_role|SERVICE_ROLE|SECURITY DEFINER/);
      expect(src).not.toMatch(/\.rpc\(/);
    }
  });
});

describe("privacy — login stays approximate, consent-gated", () => {
  it("the login read path carries no coordinate/address column", () => {
    const seg = SIGNALS.slice(
      SIGNALS.indexOf("login_location"),
      SIGNALS.indexOf("company_need_location"),
    );
    expect(seg).not.toMatch(/\blatitude\b|\blongitude\b|\baddress\b/);
  });
  it("the owner view only renders login when consented", () => {
    // revoked / not_requested login signals are skipped before grouping.
    expect(MY_SIGNALS).toMatch(/login_location[\s\S]{0,80}sourceStatus !== "consented"[\s\S]{0,20}continue/);
  });
});
