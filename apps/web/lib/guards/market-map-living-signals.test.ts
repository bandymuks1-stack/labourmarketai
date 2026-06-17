import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  hasAnySelfSignal,
  type SelfSignalBoard,
} from "@/lib/market-map/self-signal";

/**
 * Market Map living-signals guard.
 *
 * The map must read as a real labour-market signal surface, not an empty
 * placeholder. A logged-in user's profile / company / preferred locations ARE
 * real signals, shown at country/region level. This guard enforces:
 *   A. no "empty/fake" framing in the copy;
 *   B. no empty-state when any real signal exists;
 *   C. the signal-category legend (profile/company/login/preferred);
 *   D. mobile CTAs;
 *   E. login location is never exact (privacy).
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const LOCALES = ["lt", "en", "ru"] as const;

const SHELL = "components/app/market-map-shell.tsx";
const SELF = "components/app/market-map-self-signal.tsx";
const SRC = "lib/market-map/self-signal.ts";

// ── A. Copy ban ───────────────────────────────────────────────────────────
describe("A. Market Map copy has no 'empty/fake' framing", () => {
  const BANNED: RegExp[] = [
    /kol kas tuščias/i,
    /realūs duomenys turės vietos lauką/i,
    /jokių netikrų taškų/i,
    /netikri taškai/i,
    /netikri vartotojai/i,
    /\bfake\b/i,
    /empty for now/i,
    /no fake (markers|points)/i,
    /пока пуста/i,
    /фиктивных точек/i,
    /фальшив/i,
  ];
  for (const loc of LOCALES) {
    it(`${loc}: marketMap block contains none of the banned phrases`, () => {
      const blob = JSON.stringify(
        JSON.parse(read(`messages/${loc}.json`)).marketMap,
      );
      for (const re of BANNED) {
        expect(blob, `${loc} must not contain ${re}`).not.toMatch(re);
      }
    });
  }
});

// ── B. No empty-state when a real signal exists ─────────────────────────────
describe("B. A real signal means a live surface, never an empty state", () => {
  const base = (): SelfSignalBoard => ({
    worker: { kind: "worker", name: null, countryCode: null, hasLocation: false },
    company: null,
    preferred: [],
  });

  it("worker country → has signal", () => {
    expect(
      hasAnySelfSignal({
        ...base(),
        worker: { kind: "worker", name: "x", countryCode: "LT", hasLocation: true },
      }),
    ).toBe(true);
  });
  it("company country → has signal", () => {
    expect(
      hasAnySelfSignal({
        ...base(),
        company: { kind: "company", name: "c", countryCode: "PL", hasLocation: true },
      }),
    ).toBe(true);
  });
  it("preferred location → has signal", () => {
    expect(hasAnySelfSignal({ ...base(), preferred: ["DE"] })).toBe(true);
  });
  it("nothing set → no signal (then the panel shows a real completion action)", () => {
    expect(hasAnySelfSignal(base())).toBe(false);
    expect(hasAnySelfSignal(null)).toBe(false);
  });

  it("shell gates the empty state on the owner read layer + demand, not demand alone", () => {
    const shell = read(SHELL);
    expect(shell).toMatch(/getOwnMarketSignals/);
    expect(shell).toMatch(/hasRealSignal/);
    // The banned empty-state keys are gone.
    expect(shell).not.toMatch(/canvasEmptyTitle|canvasEmptyBody/);
  });
});

// ── C. Signal-category legend ───────────────────────────────────────────────
describe("C. The self-signal panel separates the signal categories", () => {
  const ui = read(SELF);
  for (const testid of [
    "market-map-self-signal-worker",
    "market-map-self-signal-company",
    "market-map-self-signal-login",
    "market-map-self-signal-preferred",
    "market-map-country-level-notice",
  ]) {
    it(`renders ${testid}`, () => {
      // testid may be inline (`data-testid="…"`) or passed via a `testId` prop.
      expect(ui).toContain(testid);
    });
  }
  for (const loc of LOCALES) {
    it(`${loc}: the five category labels exist`, () => {
      const s = JSON.parse(read(`messages/${loc}.json`)).marketMap.selfSignal;
      for (const k of [
        "profileLabel",
        "companyLabel",
        "loginLabel",
        "preferredLabel",
        "countryLevelNotice",
      ]) {
        expect(s[k], `${loc} selfSignal.${k}`).toBeTruthy();
      }
    });
  }
});

// ── D. Mobile CTAs ──────────────────────────────────────────────────────────
describe("D. Real CTAs are present (refine / add location / add demand)", () => {
  const ui = read(SELF);
  const shell = read(SHELL);
  it("self-signal panel offers refine + add-preferred CTAs to real routes", () => {
    expect(ui).toMatch(/ctaRefineProfile/);
    expect(ui).toMatch(/ctaAddPreferred/);
    expect(ui).toMatch(/\/dashboard\/profile/);
    expect(ui).toMatch(/market-map-self-signal-preferred-add/);
  });
  it("shell offers a company-need (demand) CTA to a real route", () => {
    expect(shell).toMatch(/market-map-demand-add/);
    expect(shell).toMatch(/\/dashboard\/company/);
  });
});

// ── E. Privacy: login location never exact ──────────────────────────────────
describe("E. Privacy — country/region only, login never exact", () => {
  it("self-signal source emits no coordinates / exact address", () => {
    const src = read(SRC);
    expect(src).not.toMatch(/\blatitude\b|\blongitude\b/);
    expect(src).not.toMatch(/\blat\b\s*[:=].*\blng\b/i);
  });
  it("login row uses the neutral copy, and the panel renders no lat/lng", () => {
    const ui = read(SELF);
    expect(ui).toMatch(/loginNeutral/);
    expect(ui).not.toMatch(/\blatitude\b|\blongitude\b/i);
  });
  for (const loc of LOCALES) {
    it(`${loc}: login neutral copy promises reliable determination, not an exact point`, () => {
      const s = JSON.parse(read(`messages/${loc}.json`)).marketMap.selfSignal;
      expect(s.loginNeutral, `${loc} loginNeutral`).toBeTruthy();
      expect(String(s.loginNeutral)).not.toMatch(/adres|address|адрес/i);
    });
  }
});
