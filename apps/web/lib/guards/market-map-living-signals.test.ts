import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Market Map living-signals guard.
 *
 * The map reads as a real labour-market signal surface, not a placeholder:
 *   A. no "empty/fake" framing in the copy;
 *   B. the shell gates the empty state on real signals (owner read layer +
 *      demand), never on demand alone, and never shows "kol kas tuščias";
 *   E. the read layer never emits an exact point / coordinates, and login
 *      location copy is approximate (never an address).
 * (Category rendering, filter chips and CTAs are covered by
 * market-map-ui-wiring-v1.)
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const LOCALES = ["lt", "en", "ru"] as const;

const SHELL = "components/app/market-map-shell.tsx";
const MODEL = "lib/market-map/signal-model.ts";
const FETCHER = "lib/market-map/signals.ts";
const MY = "components/app/market-map-my-signals.tsx";

// ── A. Copy ban ─────────────────────────────────────────────────────────────
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
  it("shell gates the empty state on the owner read layer + demand, not demand alone", () => {
    const shell = read(SHELL);
    expect(shell).toMatch(/getOwnMarketSignals/);
    expect(shell).toMatch(/hasRealSignal/);
    // The banned empty-state keys are gone.
    expect(shell).not.toMatch(/canvasEmptyTitle|canvasEmptyBody/);
  });
});

// ── E. Privacy: country/region only, login never exact ──────────────────────
describe("E. Privacy — read layer emits no exact point", () => {
  it("the read layer (model + owner fetcher) emits no coordinates", () => {
    for (const rel of [MODEL, FETCHER, MY]) {
      const s = read(rel);
      expect(s, rel).not.toMatch(/\blatitude\b|\blongitude\b/);
      expect(s, rel).not.toMatch(/\blat\b\s*[:=].*\blng\b/i);
      expect(s, rel).not.toMatch(/mapbox|google[^\n]*maps/i);
    }
  });
  it("the owner panel renders the login signal as neutral, not an address", () => {
    const my = read(MY);
    expect(my).toMatch(/loginNeutral/);
  });
  for (const loc of LOCALES) {
    it(`${loc}: login neutral copy is approximate, not an address`, () => {
      const ms = JSON.parse(read(`messages/${loc}.json`)).marketMap.mySignals;
      expect(ms.loginNeutral, `${loc} loginNeutral`).toBeTruthy();
      expect(String(ms.loginNeutral)).not.toMatch(/adres|address|адрес/i);
    });
  }
});
