import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { readPublicEntry } from "@/lib/marketing/public-entry";
import { INTENT_REGISTRY, type RoutedIntent } from "@/lib/conversation/intent-registry";
import {
  PARTNER_DOOR,
  STARTING_CONTEXTS,
  FINAL_CTA_LINKS,
} from "@/lib/marketing/public-doors";
import {
  COVERAGE_COUNTRIES,
  coverageCountryCount,
  publicCoverageView,
} from "@/lib/market-map/public-coverage";

/**
 * THE LANDING MUST NOT READ AS A JOB BOARD (owner window 11 §§16–20).
 *
 * The owner walked production twice. The second time the verdict was blunt:
 * *"the public landing product story remains essentially unchanged."* It was
 * accurate — the fixes that window had shipped were all behind a login, and
 * the page still opened with a worker-shaped headline over a navigation
 * reading `Darbo skelbimai · Darbuotojams · Įmonėms · Agentūroms`.
 *
 * This guard pins the parts of the answer that a future edit could quietly
 * undo. It deliberately asserts STRUCTURE and REACHABILITY, never prose: copy
 * must stay free to improve.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const ACTIVE = ["lt", "en", "ru", "nl", "de"] as const;
const catalog = (loc: string) =>
  JSON.parse(read(`messages/${loc}.json`)) as Record<string, never>;
const at = (o: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((a, k) => (a as Record<string, unknown>)?.[k], o);

describe("§16 the navigation stops announcing three fixed roles", () => {
  const nav = read("components/layouts/site-nav.tsx");

  it("no audience page is a primary nav item", () => {
    for (const href of ["/for-workers", "/for-companies", "/for-agencies"]) {
      expect(nav, `${href} is back in the primary nav`).not.toContain(`href: "${href}"`);
    }
  });

  it("…and every one of them stays reachable from two real surfaces", () => {
    const footer = read("components/layouts/site-footer.tsx");
    const doors = read("lib/marketing/public-doors.ts");
    for (const href of ["/for-workers", "/for-companies", "/for-agencies"]) {
      expect(footer).toContain(`href="${href}"`);
      expect(doors).toContain(`"${href}"`);
    }
  });
});

describe("§18 the entry offers the breadth of the graph, in ordinary words", () => {
  /**
   * The chips carry a SHORT topic; the field receives the FULL sentence. Both
   * halves must exist in every active locale, or a chip either shouts a whole
   * sentence (the §19 density defect) or fills the field with a fragment.
   */
  for (const loc of ACTIVE) {
    it(`[${loc}] every example has both a routed sentence and a short label`, () => {
      const entry = at(catalog(loc), "landing.entry") as {
        examples: Record<string, string>;
        exampleLabels: Record<string, string>;
      };
      const keys = Object.keys(entry.examples).sort();
      expect(keys.length).toBeGreaterThanOrEqual(10);
      expect(Object.keys(entry.exampleLabels).sort()).toEqual(keys);
      for (const k of keys) {
        // The label is SHORTER than the sentence — that is the whole point.
        expect(
          entry.exampleLabels[k].length,
          `${loc}.${k}: the chip label is not shorter than the sentence`,
        ).toBeLessThan(entry.examples[k].length);
        expect(entry.exampleLabels[k].trim().length).toBeGreaterThan(3);
      }
    });
  }

  it("the chip's accessible name is the SENTENCE, not the short label", () => {
    // A screen-reader user must hear what the button will actually do.
    const src = read("components/marketing/public-entry.tsx");
    expect(src).toMatch(/aria-label=\{example\}/);
    expect(src).toMatch(/\{t\(`exampleLabels\.\$\{key\}`\)\}/);
  });

  it("the examples span at least eight distinct intents across the graph", () => {
    // Ten sentences that all mean "find me a job" would satisfy every other
    // assertion here and still be the §16 defect. This counts DIRECTIONS.
    const entry = at(catalog("lt"), "landing.entry") as { examples: Record<string, string> };
    const intents = new Set<string>();
    for (const sentence of Object.values(entry.examples)) {
      const reading = readPublicEntry(sentence);
      expect(reading.kind, `"${sentence}" is not understood by the router`).toBe("recognised");
      if (reading.kind === "recognised") intents.add(reading.intent);
    }
    expect(intents.size).toBeGreaterThanOrEqual(8);
    // …and they must not all belong to one side of the market.
    const domains = new Set(
      [...intents].map((i) => INTENT_REGISTRY[i as RoutedIntent].domain),
    );
    expect(domains.size).toBeGreaterThanOrEqual(4);
  });

  it("no example label uses the product's own vocabulary", () => {
    // §18: "Do not require SUPPLY / DEMAND vocabulary."
    const banned = /\b(supply|demand|capacity|evidence|pasi[uū]la|paklaus|pajėgum|įrodym|spros|предложени|aanbod|vraag|angebot|nachfrage)\b/i;
    for (const loc of ACTIVE) {
      const labels = at(catalog(loc), "landing.entry.exampleLabels") as Record<string, string>;
      for (const [k, v] of Object.entries(labels)) {
        expect(v, `${loc}.${k} uses product vocabulary: "${v}"`).not.toMatch(banned);
      }
    }
  });
});

describe("§17 the public map is real geography and claims no activity", () => {
  const band = read("components/marketing/public-market-map-band.tsx");
  const coverage = read("lib/market-map/public-coverage.ts");

  it("it draws the canonical map, not a second one", () => {
    expect(band).toMatch(/from "@\/components\/app\/market-map\/market-map"/);
    expect(band).toMatch(/mode="landing"/);
  });

  it("every marker is a real market at a real centroid", () => {
    const view = publicCoverageView((c) => c);
    expect(view.regions.length).toBe(coverageCountryCount());
    expect(view.regions.length).toBeGreaterThan(10);
    for (const r of view.regions) {
      expect(COVERAGE_COUNTRIES).toContain(r.code);
      for (const a of r.anchors) {
        expect(Number.isFinite(a.lat) && Number.isFinite(a.lng)).toBe(true);
        // 0,0 is the Gulf of Guinea, not a labour market.
        expect(Math.abs(a.lat) + Math.abs(a.lng)).toBeGreaterThan(0);
        expect(a.precision).toBe("country");
      }
    }
  });

  it("NO anchor carries a count — UNKNOWN is never rendered as ZERO", () => {
    // SEP-7. "Lietuva · 0" would assert that nothing is happening there.
    const view = publicCoverageView((c) => c);
    for (const r of view.regions) {
      for (const a of r.anchors) {
        expect(a.weight, `${a.id} invented a quantity`).toBeUndefined();
      }
    }
    const map = read("components/app/market-map/market-map.tsx");
    expect(map).toMatch(/hasWeight/);
  });

  it("the view labels itself as coverage, and the badge has its own words", () => {
    expect(publicCoverageView((c) => c).origin).toBe("coverage");
    const map = read("components/app/market-map/market-map.tsx");
    expect(map).toMatch(/tOrigin\("coverage"\)/);
    for (const loc of ACTIVE) {
      const v = at(catalog(loc), "map.origin.coverage");
      expect(v, `${loc}: map.origin.coverage`).toBeTypeOf("string");
    }
  });

  it("the section states in words what it is NOT showing", () => {
    expect(band).toMatch(/notPublished/);
    for (const loc of ACTIVE) {
      const v = at(catalog(loc), "landing.marketMap.notPublished") as string;
      expect(v, `${loc}: notPublished`).toBeTypeOf("string");
      expect(v.length).toBeGreaterThan(60);
    }
  });

  it("the map has a text alternative — the same places as a list", () => {
    expect(band).toMatch(/market-map-countries/);
    expect(band).toMatch(/marketNames/);
  });

  it("the coverage reader records WHY it cannot show activity", () => {
    // The evidence must travel with the code: the next agent has to be able to
    // see that this is a data-access gate, not a missing feature.
    expect(coverage).toMatch(/anon/);
    expect(coverage).toMatch(/public_vacancies/);
    expect(coverage).toMatch(/HG-2026-09-07-public-market-map/);
  });
});

describe("§20 starting contexts are contexts, not identities", () => {
  it("partner is not one of them, and is still a real door", () => {
    expect(STARTING_CONTEXTS.map((c) => c.key)).not.toContain("partner");
    expect(PARTNER_DOOR.href).toBe("/about");
    // The full five-door list is unchanged, so every existing route check and
    // production walk still asserts the same destinations.
    expect(FINAL_CTA_LINKS.map((d) => d.key).sort()).toEqual([
      "agency",
      "employer",
      "institution",
      "partner",
      "worker",
    ]);
  });

  it("the section says out loud that this is not a permanent role", () => {
    const band = read("components/marketing/starting-contexts-band.tsx");
    expect(band).toMatch(/landing\.contexts/);
    expect(band).toMatch(/partner-door-line/);
    for (const loc of ACTIVE) {
      const sub = at(catalog(loc), "landing.contexts.subcopy") as string;
      expect(sub, `${loc}: contexts.subcopy`).toBeTypeOf("string");
      expect(sub.length).toBeGreaterThan(60);
    }
  });
});

describe("§19 the visitor reaches a way to start without a long scroll", () => {
  const focus = read("app/[locale]/focus-landing/focus-landing.tsx");

  it("the doors come BEFORE the explanation, the chain and the sample card", () => {
    const i = (c: string) => focus.indexOf(`<${c}`);
    expect(i("StartingContextsBand")).toBeGreaterThan(0);
    expect(i("StartingContextsBand")).toBeLessThan(i("ProductChainBand"));
    expect(i("StartingContextsBand")).toBeLessThan(i("PlayerCardShowcase"));
  });

  it("the market map comes before both, directly under the entry", () => {
    const i = (c: string) => focus.indexOf(`<${c}`);
    expect(i("PublicEntry")).toBeLessThan(i("PublicMarketMapBand"));
    expect(i("PublicMarketMapBand")).toBeLessThan(i("StartingContextsBand"));
  });

  it("the sample card no longer out-shouts the page's own headings", () => {
    // Read the h2's OWN className, not the file: the comment beside it names
    // the old scale, and a whole-file match would fail on the explanation of
    // the very change it is checking for.
    const showcase = read("components/marketing/player-card-showcase.tsx");
    const h2 = showcase.match(/<h2 className="([^"]+)"/)?.[1];
    expect(h2, "the showcase has no <h2> with a className").toBeTypeOf("string");
    expect(h2, "the showcase heading is a second hero").not.toMatch(/sm:text-5xl/);
    expect(h2).toMatch(/text-3xl/);
    expect(h2).toMatch(/sm:text-4xl/);
  });
});
