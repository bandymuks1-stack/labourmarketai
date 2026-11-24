import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Negative residual guard for PLATFORM_DOCTRINE §18 (Realumo principas).
 *
 * §18 forbids a demo / pilot / "bandomoji prieiga" / "Tier-2 rankinis
 * aktyvavimas" / intermediate-layer framing over the real product — neither as
 * text nor as concept in the UX. This guard replaces the old POSITIVE guard
 * (pilot-workflow-offer.test.ts, which asserted the pilot offer existed) with a
 * NEGATIVE one: the framing must stay gone.
 *
 * Honest product truth ("records are private", "no matching engine yet") is NOT
 * pilot framing and is intentionally allowed — this guard only bans the wrapper
 * vocabulary and the removed surfaces.
 */

const APP_ROOT = join(__dirname, "..", "..");
function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}

// The product locales that must never show the wrapper framing.
const PRODUCT_LOCALES = ["lt", "en"] as const;

// User-facing framing strings the cleanup removed. Scoped tightly so honest
// internal identifiers (file names, the `pilotDisclaimer` key, test ids) are
// not false-positives — those carry no user-facing pilot framing.
const FORBIDDEN_COPY: RegExp[] = [
  /Užsakyti pilotą/i,
  /bandomoji prieiga/i,
  /bandomosios prieigos/i,
  /bandomąją prieigą/i,
  /Tik rankinė peržiūra/i,
  /pilotinis režimas/i, // the old role "pilot mode" disclaimer framing
  /Tier-2/i,
];

describe("§18 Realumo principas — no pilot/demo/Tier-2 framing in product copy", () => {
  for (const locale of PRODUCT_LOCALES) {
    const raw = read(`messages/${locale}.json`);
    const json = JSON.parse(raw) as Record<string, unknown> & {
      pricing?: Record<string, unknown>;
    };

    it(`${locale}.json carries none of the removed wrapper framing strings`, () => {
      for (const rx of FORBIDDEN_COPY) {
        expect(rx.test(raw), `${locale}.json must not match ${rx}`).toBe(false);
      }
    });

    it(`${locale}.json has no pilot/Tier-2 wrapper namespaces`, () => {
      expect(json.tier2Readiness, "tier2Readiness removed").toBeUndefined();
      expect(json.pilotMode, "pilotMode removed").toBeUndefined();
      expect(json.pilotReadiness, "pilotReadiness removed").toBeUndefined();
      expect(json.pricing?.pilotActivation, "pricing.pilotActivation removed").toBeUndefined();
      expect(json.pricing?.pilotWorkflow, "pricing.pilotWorkflow removed").toBeUndefined();
    });

    it(`${locale}.json demand-intake done state is a founder moment, not a "we'll contact you" wrapper`, () => {
      const demand = (
        json as {
          auth?: {
            dashboard?: {
              wow?: {
                demand?: { hire?: { done?: string }; partner?: { done?: string } };
              };
            };
          };
        }
      ).auth?.dashboard?.wow?.demand;
      // Intent-specific done states (hire vs partner) — both must be present
      // and neither may be a "we'll contact you" wrapper.
      for (const done of [demand?.hire?.done, demand?.partner?.done]) {
        expect(done, `${locale} auth.dashboard.wow.demand.*.done present`).toBeTruthy();
        expect(/susisieksime|be in touch|will be in touch/i.test(done!)).toBe(false);
      }
    });
  }
});

describe("§18 Realumo principas — the removed surfaces stay removed", () => {
  const removedComponents = [
    "components/app/tier2-readiness-explainer.tsx",
    "components/app/pilot-readiness-card.tsx",
    "components/app/pilot-mode-banner.tsx",
    "components/marketing/pilot-activation-callout.tsx",
    "components/marketing/pilot-workflow-offer.tsx",
  ];
  for (const rel of removedComponents) {
    it(`${rel} no longer exists`, () => {
      expect(existsSync(join(APP_ROOT, rel))).toBe(false);
    });
  }

  const pages = [
    "app/[locale]/(marketing)/pricing/page.tsx",
    "app/[locale]/dashboard/page.tsx",
    "app/[locale]/dashboard/layout.tsx",
    "app/[locale]/dashboard/company/page.tsx",
    "app/[locale]/dashboard/buyer/page.tsx",
  ];
  for (const rel of pages) {
    it(`${rel} does not import a removed pilot/Tier-2 component`, () => {
      const src = read(rel);
      expect(src).not.toMatch(/tier2-readiness-explainer/);
      expect(src).not.toMatch(/pilot-readiness-card/);
      expect(src).not.toMatch(/pilot-mode-banner/);
      expect(src).not.toMatch(/pilot-activation-callout/);
      expect(src).not.toMatch(/pilot-workflow-offer/);
    });
  }
});
