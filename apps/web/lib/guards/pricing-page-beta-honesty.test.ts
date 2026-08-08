import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { placeholders } from "@/content/placeholders";
import { PRICING_READINESS_STATE } from "@/lib/billing/readiness";

/**
 * Guard: the public /pricing page stays honest for the closed beta.
 *
 * Pins the two P1 defects closed by the beta foundation audit
 * (docs/audits/VISIBLE_PRODUCT_SURFACE_MATRIX_CURRENT_TRUTH.md):
 *
 *   M6 — the price slot rendered `<Placeholder id="pricing.plan.<slug>" />`.
 *        Production forces placeholder markers ON (lib/env.ts), so live
 *        visitors saw dashed boxes reading "Free: pricing TBD". The slot now
 *        renders only the owner-editable PRICING_READINESS_STATE copy.
 *
 *   M7 — the page also rendered ServiceOffers, an AI-automation agency offer
 *        list at €900–€1,900, beside labour-market tiers whose own price says
 *        it is still being prepared. The component is kept; the host is gone.
 *
 * The rule underneath both: no price figure may reach /pricing until the owner
 * sets a real one. Prices are owner-gated business text — an agent may never
 * invent one, and may never dress a fabricated value up as a governed slot.
 */

const APP_ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP_ROOT, rel), "utf8");

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

const PRICING_PAGE = "app/[locale]/(marketing)/pricing/page.tsx";
const PRICING_TABLE = "components/marketing/pricing-table.tsx";

/** Any concrete money figure: "€900", "900 €", "1,500 EUR", "$1.9k". */
const PRICE_FIGURE = /(?:[€$]\s?\d[\d.,]*)|(?:\d[\d.,]*\s?(?:€|\$|EUR|USD)\b)/;

describe("M6 — the price slot never renders a fabricated price", () => {
  it("the pricing table renders no <Placeholder> at all", () => {
    const src = read(PRICING_TABLE);
    expect(
      /<Placeholder\b/.test(src),
      "pricing-table.tsx must not render a Placeholder: markers are forced " +
        "ON in production, so the slot becomes a visible dashed sample box",
    ).toBe(false);
    expect(
      /from "@\/components\/ui\/Placeholder"/.test(src),
      "pricing-table.tsx must not import Placeholder",
    ).toBe(false);
  });

  it("the price slot renders the owner-editable readiness state instead", () => {
    const src = read(PRICING_TABLE);
    expect(src).toMatch(/PRICING_READINESS_STATE/);
    expect(src).toMatch(/priceState\.\$\{PRICING_READINESS_STATE\}/);
    expect(src).toMatch(/data-testid=\{`pricing-price-state-/);
  });

  it("the orphaned `pricing.plan.*` entries are rendered by NOTHING", () => {
    // The four entries still SIT in content/placeholders.ts. Removing them is
    // the natural cleanup, but that file is inside the owner-gated landing
    // freeze (lib/guards/landing-freeze.ts) and this is not landing work, so
    // the entries stay and the render sites are what the guard pins. They are
    // dead weight, not a live defect — flagged for the owner in the PR body.
    const orphans = placeholders
      .filter((p) => p.id.startsWith("pricing.plan."))
      .map((p) => p.id);
    expect(orphans.length, "the entries are expected to still exist").toBe(4);

    const roots = ["app", "components", "lib"];
    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of walk(join(APP_ROOT, root))) {
        if (!/\.tsx?$/.test(file) || /\.test\.tsx?$/.test(file)) continue;
        const src = readFileSync(file, "utf8");
        // Only a Placeholder render site counts — doc comments citing the id
        // (readiness.ts explains the history) are fine.
        if (/<Placeholder[^>]*pricing\.plan\./.test(src)) {
          offenders.push(file.slice(APP_ROOT.length + 1).replace(/\\/g, "/"));
        }
      }
    }
    expect(
      offenders,
      "no component may render a pricing.plan.* placeholder (M6)",
    ).toEqual([]);
  });

  it("neither the page nor the table hard-codes a price figure", () => {
    for (const rel of [PRICING_PAGE, PRICING_TABLE]) {
      const src = read(rel).replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "");
      expect(PRICE_FIGURE.test(src), `${rel} carries a price figure`).toBe(
        false,
      );
    }
  });

  it("every locale's priceState copy states a price is not yet sayable", () => {
    for (const loc of ["en", "lt", "ru", "de", "nl"] as const) {
      const m = JSON.parse(read(`messages/${loc}.json`)) as {
        pricing?: { priceState?: Record<string, string> };
      };
      const copy = m.pricing?.priceState?.[PRICING_READINESS_STATE];
      expect(typeof copy, `${loc}: pricing.priceState.*`).toBe("string");
      expect(
        PRICE_FIGURE.test(copy!),
        `${loc}: readiness copy must not contain a price figure`,
      ).toBe(false);
    }
  });
});

describe("M7 — /pricing sells the labour market, not agency services", () => {
  it("the page does not import or render ServiceOffers", () => {
    const src = read(PRICING_PAGE);
    expect(
      /^\s*import[^;]*service-offers/m.test(src),
      "/pricing must not import service-offers",
    ).toBe(false);
    expect(
      /<ServiceOffers\s*\/?>/.test(src.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "")),
      "/pricing must not render <ServiceOffers />",
    ).toBe(false);
  });

  it("the ServiceOffers component and its copy are kept, not deleted", () => {
    // Removing the host is the fix; deleting the owner's service copy is not
    // an agent's call. The offers keep their own honesty guard
    // (service-offers-baseline.test.ts) for whichever host the owner picks.
    expect(read("components/marketing/service-offers.tsx")).toContain(
      "export async function ServiceOffers",
    );
    for (const loc of ["en", "lt"] as const) {
      const m = JSON.parse(read(`messages/${loc}.json`)) as {
        services?: { offers?: unknown[] };
      };
      expect(Array.isArray(m.services?.offers), `${loc}: services.offers`).toBe(
        true,
      );
    }
  });

  it("no service price figure survives anywhere on the pricing page tree", () => {
    // The page's own sections only — the guard above already proves the offer
    // list is not among them.
    const src = read(PRICING_PAGE);
    for (const marker of ["ServiceOffers", "services."]) {
      expect(
        src.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").includes(marker),
        `/pricing must not reach the services namespace (${marker})`,
      ).toBe(false);
    }
  });
});

describe("M8 — the three plan registries stay non-overlapping", () => {
  it("the marketing registry carries names only, never a price column", () => {
    const src = read("lib/marketing/plans.ts");
    expect(src).toMatch(/slug, name_lt, name_en/);
    expect(
      /price/i.test(src.replace(/\/\*[\s\S]*?\*\//g, "")),
      "lib/marketing/plans.ts must not select or model a price",
    ).toBe(false);
  });

  it("the split between the three registries is documented in code", () => {
    // M8 called them "three overlapping price registries". They are not
    // duplicates — each answers a different question — but that was only
    // discoverable by reading all three, so the map lives in code now.
    const src = read("lib/marketing/plans.ts");
    for (const cited of [
      "lib/billing/plans.ts",
      "lib/billing/readiness.ts",
      "price_eur_monthly",
    ]) {
      expect(src, `the registry map must cite ${cited}`).toContain(cited);
    }
  });

  it("the entitlement registry never carries a price either", () => {
    const src = read("lib/billing/plans.ts").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(PRICE_FIGURE.test(src), "lib/billing/plans.ts price figure").toBe(
      false,
    );
  });
});
