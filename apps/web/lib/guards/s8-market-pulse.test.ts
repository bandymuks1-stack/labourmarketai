import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * S8 guard — gyva rinkos vizualizacija ant REALIŲ duomenų.
 * The pulse board renders ONLY getMarketAnalysis()/getLeague() aggregates:
 * bar widths are pure functions of real counts, thermometer chips render
 * only for real scores, small samples carry their warning, empty markets
 * say so — no fake liveliness, no invented numbers, no random.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

const board = read("components/app/market-pulse-board.tsx");
const page = read("app/[locale]/dashboard/admin/market/page.tsx");

const LOCALES = ["en", "lt", "lv", "et", "nl", "de", "da", "no", "sv", "pl", "ru"];

describe("market pulse renders only real aggregates", () => {
  it("consumes the existing analysis + league read models (no own reads)", () => {
    expect(board).toMatch(/MarketAnalysis/);
    expect(board).toMatch(/LeagueData/);
    expect(board).not.toMatch(/createClient|supabase|\.rpc\(|fetch\(/);
  });
  it("bar widths are pure functions of the real counts", () => {
    expect(board).toMatch(/\(s\.workers \/ supplyMax\) \* 100/);
    expect(board).toMatch(/\(d\.requests \/ demandMax\) \* 100/);
    expect(board).not.toMatch(/Math\.random|Date\.now/);
  });
  it("thermometer chips render ONLY real scores (kind === 'score')", () => {
    expect(board).toMatch(/c\.thermometer\.kind === "score"/);
  });
  it("small samples carry their warning; empty states are honest", () => {
    expect(board).toMatch(/smallSample/);
    for (const key of ["supplyEmpty", "demandEmpty", "thermoEmpty", "gapsEmpty"]) {
      expect(board).toContain(`t("${key}")`);
    }
  });
  it("no decorative liveliness — no pulsing dots pretending activity", () => {
    expect(board).not.toMatch(/live-dot|signal-dot|ticker|map-drift/);
  });
  it("mounts on the admin market page (superadmin-gated route)", () => {
    expect(page).toMatch(/<MarketPulseBoard\b/);
    expect(page).toMatch(/requireSuperadmin/);
  });
});

describe("pulse copy exists in all 10 locales", () => {
  it("key set present everywhere", () => {
    for (const locale of LOCALES) {
      const j = JSON.parse(read(`messages/${locale}.json`));
      const p = j.admin?.market?.pulse;
      for (const k of [
        "title", "supplyTitle", "supplyEmpty", "demandTitle", "demandEmpty",
        "gapsTitle", "gapLine", "thermoTitle", "thermoEmpty",
      ]) {
        expect(p?.[k], `${locale} pulse.${k}`).toBeTruthy();
      }
    }
  });
});
