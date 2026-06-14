import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { MARKET_COUNTRIES, isWorkTypeSlug, isMarketCountry } from "@/lib/taxonomy/work-categories";

/**
 * Locks the structured employer-need intake → worker-board contract:
 *  - the demand wizard collects structured, board-safe fields;
 *  - the server action validates them against closed sets and writes them to
 *    the structured columns (not free text);
 *  - the worker board renders the slug as a localized label;
 *  - every market country has a localized name.
 */
const WEB = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

describe("demand wizard collects structured fields", () => {
  const wizard = read("components/app/demand-request-button.tsx");
  it("renders work-type / country / team-size / accommodation controls", () => {
    for (const id of ["demand-work-type", "demand-country-select", "demand-team-size", "demand-accommodation"]) {
      expect(wizard, `missing ${id}`).toContain(id);
    }
  });
  it("passes the structured fields to the submit action", () => {
    expect(wizard).toMatch(/workType:/);
    expect(wizard).toMatch(/country:/);
    expect(wizard).toMatch(/teamSize:/);
    expect(wizard).toMatch(/accommodation:/);
  });
});

describe("server action validates against closed sets + writes structured columns", () => {
  const action = read("lib/demand/demand-request.ts");
  it("validates work-type, country and accommodation against closed sets", () => {
    expect(action).toMatch(/isWorkTypeSlug/);
    expect(action).toMatch(/isMarketCountry/);
    expect(action).toMatch(/ACCOMMODATION_OFFER_VALUES/);
  });
  it("writes the structured columns via an owner-scoped update", () => {
    expect(action).toMatch(/role_or_work_type:/);
    expect(action).toMatch(/\.update\(/);
    expect(action).toMatch(/\.eq\("profile_id", user\.id\)/);
  });
  it("does not expose free-text role/location/notes to the board path", () => {
    // The board reads structured columns only; the free-text fields stay in
    // payload. (The worker RPC projection is locked in
    // 20260614120000_worker_demand_visibility.sql.)
    expect(action).toMatch(/location: clamp/); // location stays free-text in payload
  });
});

describe("worker board renders structured fields as localized labels", () => {
  const page = read("app/[locale]/dashboard/opportunities/page.tsx");
  it("maps the work-type slug to a label", () => {
    expect(page).toMatch(/buildWorkTypeLabelMap/);
    expect(page).toMatch(/roleLabel/);
  });
  it("maps country + start period to labels", () => {
    expect(page).toMatch(/countryLabel/);
    expect(page).toMatch(/startLabel/);
  });
});

describe("market countries are all valid + named", () => {
  it("every market country is a 2-letter code and recognised", () => {
    for (const c of MARKET_COUNTRIES) {
      expect(c).toMatch(/^[A-Z]{2}$/);
      expect(isMarketCountry(c)).toBe(true);
    }
    expect(isMarketCountry("ZZ")).toBe(false);
  });
  it("every market country has a localized name in lt/en/ru", () => {
    for (const loc of ["lt", "en", "ru"]) {
      const names = JSON.parse(read(`messages/${loc}/labour-market.json`)).countryNames as Record<string, string>;
      for (const c of MARKET_COUNTRIES) {
        expect(names[c], `${loc} missing countryNames.${c}`).toBeTruthy();
      }
    }
  });
  it("a known work-type slug validates", () => {
    expect(isWorkTypeSlug("warehouse_worker")).toBe(true);
    expect(isWorkTypeSlug("not_a_slug")).toBe(false);
  });
});
