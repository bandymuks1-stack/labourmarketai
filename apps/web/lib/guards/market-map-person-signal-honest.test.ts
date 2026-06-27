import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Market map — honest person-signal state guard (Core Product Sprint Train v2,
 * Wagon 5 — map as the main market surface).
 *
 * The unified layers legend must not overstate the user's market presence. The
 * "my person signal" row was previously hard-coded to `state: "active"` on every
 * render — so a brand-new user with no saved location saw an empty map AND a
 * legend claiming an ACTIVE signal. That is an overstated (fake) signal.
 *
 * The honest rule, using existing RLS-scoped data only (no schema, no fake
 * marker): the person signal is "active" ONLY when the user has a real saved
 * location (a `preferred_locations` row); otherwise the row is "incomplete" and
 * carries an honest "add your location to appear" hint.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const PAGE = "app/[locale]/dashboard/market-map/page.tsx";
const ACTIVE = ["lt", "en", "ru"] as const;

describe("the person-signal legend row reflects real saved-location state", () => {
  const page = read(PAGE);

  it("derives presence from the real preferred-locations data (existing data only)", () => {
    expect(page).toMatch(/listOwnPreferredLocations/);
    expect(page).toMatch(/const hasPreferredLocation =/);
    // Derived from the fetched `preferred` rows, not a constant.
    expect(page).toMatch(/Array\.isArray\(preferred\)\s*&&\s*preferred\.length\s*>\s*0/);
  });

  it("is no longer hard-coded active — state is conditional on real presence", () => {
    // The person row's state must be the conditional, never a bare active.
    expect(page).toMatch(/state:\s*hasPreferredLocation\s*\?\s*"active"\s*:\s*"incomplete"/);
    // Guard against a regression to the old unconditional person row.
    expect(page).not.toMatch(
      /label:\s*`\$\{tLayers\("personSignal"\)\}[^`]*`,\s*\n\s*state:\s*"active"/,
    );
  });

  it("shows the honest 'add your location' hint when there is no saved location", () => {
    expect(page).toMatch(
      /hint:\s*hasPreferredLocation\s*\?\s*undefined\s*:\s*tLayers\("personIncomplete"\)/,
    );
  });
});

describe("the honest incomplete hint exists in every active locale", () => {
  for (const loc of ACTIVE) {
    it(`${loc}: mapLayers.personIncomplete is present and non-empty`, () => {
      const v = (
        JSON.parse(read(`messages/${loc}.json`)) as {
          mapLayers?: { personIncomplete?: string };
        }
      ).mapLayers?.personIncomplete;
      expect(v?.trim().length, `${loc} mapLayers.personIncomplete`).toBeGreaterThan(0);
    });
  }
});
