import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";

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

// The §22 block below RENDERS the first screen's two components. Their link
// primitive needs Next request context and their telemetry needs a browser,
// neither of which is the property under test — so both are stubbed to what
// matters here: an <a> carrying its className, and a no-op event.
vi.mock("@/lib/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: Record<string, unknown>) =>
    createElement("a", { href: String(href), ...rest }, children as ReactNode),
}));
vi.mock("@/lib/telemetry/task", () => ({ trackFunnel: () => undefined }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (ns: string) => (k: string) => `${ns}.${k}`,
}));

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
// 2026-09-20: PL is an active UI locale; the Polish catalog reached full parity in the same PR, so pl is covered here like the other five.
const ACTIVE = ["lt", "en", "ru", "nl", "de", "pl"] as const;
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

  /**
   * RE-ANCHORED, not relaxed (owner directive 2026-09-09 §15).
   *
   * This assertion used to read `landing.marketMap.notPublished` — a second
   * sentence that re-stated the negation the owner has now removed. What it
   * was protecting is a PROPERTY of the band, not that particular key: the
   * section must say, in words a visitor reads, that the markers are markets
   * and not today's activity. That sentence is `shows`, it always was, and it
   * is what the assertion now names.
   *
   * The negative control below is the half that matters: it fails if the copy
   * ever drops the negation and starts describing the map only in the
   * positive — which is exactly the regression the original pin existed to
   * stop, and which a bare "the key is a string" check could never catch.
   */
  it("the section states in words what it is NOT showing", () => {
    expect(band).toMatch(/t\("shows"/);
    // Each active locale's own words for "these are markets, NOT today's
    // activity". Written per locale because a negation is a language fact.
    //
    // Bounded with a Unicode look-around, NOT `\b`: JavaScript's `\b` is
    // defined over ASCII `\w`, so `/\bне\b/` never matches Russian at all —
    // it failed on this very catalogue on the first run, on a string that
    // plainly reads "а не сегодняшняя активность".
    const word = (w: string) => new RegExp(`(?<!\\p{L})${w}(?!\\p{L})`, "iu");
    const NEGATION: Readonly<Record<(typeof ACTIVE)[number], RegExp>> = {
      lt: word("ne"),
      en: word("not"),
      ru: word("не"),
      nl: word("niet|geen"),
      de: word("nicht|keine?"),
      pl: word("nie"),
    };
    for (const loc of ACTIVE) {
      const v = at(catalog(loc), "landing.marketMap.shows") as string;
      expect(v, `${loc}: shows`).toBeTypeOf("string");
      expect(
        NEGATION[loc].test(v),
        `${loc}: the map caption stopped saying what the markers are NOT — "${v}"`,
      ).toBe(true);
    }
    // The bound is real: a locale whose caption lost the negation must fail.
    expect(NEGATION.ru.test("Это рынки и сегодняшняя активность.")).toBe(false);
    expect(NEGATION.en.test("These are markets and today's activity.")).toBe(false);
    // ...and it is a WORD boundary, not a substring match: "note", "nettо",
    // "keiner Angabe" must not read as the negation they contain.
    expect(NEGATION.en.test("Note the markets.")).toBe(false);
  });

  /**
   * The line the owner put in the negation's place. It is an INVITATION, so
   * it is pinned as one: present in every active locale, and never a
   * quantity. A count here would be the fake-activity claim the band exists
   * to prevent, arriving through the one line nobody is watching.
   */
  it("the last line invites, and never states a per-place quantity", () => {
    expect(band).toMatch(/t\("invite"\)/);
    for (const loc of ACTIVE) {
      const v = at(catalog(loc), "landing.marketMap.invite") as string;
      expect(v, `${loc}: invite`).toBeTypeOf("string");
      expect(v.length, `${loc}: invite`).toBeGreaterThan(20);
      expect(/\d/.test(v), `${loc}: the invite line states a number`).toBe(false);
    }
    // The removed key must not linger half-wired in any active catalogue.
    for (const loc of ACTIVE) {
      expect(
        at(catalog(loc), "landing.marketMap.notPublished"),
        `${loc}: notPublished survived the §15 correction`,
      ).toBeUndefined();
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

/**
 * §22 VALUE FIRST, ONE NEXT STEP, FOUR EXAMPLES (owner directive 2026-09-23:
 * landing §22 "fix the story, not CSS").
 *
 * The owner's reading of production: the page showed controls and a map
 * before it said what the product is, and offered ten equal choices before
 * any value. The directive explicitly SUPERSEDES two window-11 readings — the
 * #1609 §16 instruction-style h1, and the §18 reading that all ten example
 * chips must be visible by default — and KEEPS §17 map honesty and §20
 * contexts-not-identities (both still pinned above, unchanged).
 *
 * What is pinned here is structure, never prose, so the copy stays free:
 *   · the hero namespace is still exactly one headline and one sub;
 *   · the first screen carries exactly ONE primary action;
 *   · at most four example chips are MOUNTED by default, and every one of
 *     the catalogue's examples stays reachable through the disclosure.
 * Each assertion carries a negative control proving it can fail.
 */
describe("§22 the first screen says what this is, then offers one next step", () => {
  const PRIMARY = /bg-gradient-cta/g;
  const countPrimary = (html: string) => (html.match(PRIMARY) ?? []).length;
  const heroKeysOk = (hero: Record<string, unknown>) =>
    JSON.stringify(Object.keys(hero).sort()) === JSON.stringify(["headline", "sub"]);

  it("landing.hero is exactly [headline, sub] in every active locale", () => {
    for (const loc of ACTIVE) {
      const hero = at(catalog(loc), "landing.hero") as Record<string, unknown>;
      expect(heroKeysOk(hero), `${loc}: landing.hero keys ${Object.keys(hero)}`).toBe(true);
      for (const k of ["headline", "sub"]) {
        expect(hero[k], `${loc}: landing.hero.${k}`).toBeTypeOf("string");
      }
    }
    // Control: a third hero key (the old scenario's shape) must fail.
    expect(heroKeysOk({ headline: "", sub: "", scenario: "" })).toBe(false);
  });

  it("the h1 is not the entry's instruction any more — the field's label carries that", () => {
    // Pinned as a RELATION, not a phrase: the headline may say anything except
    // repeat the input label, which is what #1609 §16 had made it do.
    for (const loc of ACTIVE) {
      const headline = at(catalog(loc), "landing.hero.headline") as string;
      const label = at(catalog(loc), "landing.entry.label") as string;
      expect(headline.toLowerCase(), `${loc}: the h1 repeats the entry label`).not.toBe(
        label.toLowerCase(),
      );
    }
  });

  it("the hero renders ONE primary action and one secondary", async () => {
    const { LandingPrimaryActions } = await import("@/components/marketing/landing-primary-actions");
    const html = renderToStaticMarkup(
      await LandingPrimaryActions({ locale: "lt", surface: "landing_hero" }),
    );
    expect(countPrimary(html)).toBe(1);
    expect(html).toContain('href="/lt/auth/signup"');
    expect(html).toContain('href="/jobs"');
    expect(html).toContain("nav.startNow");
    expect(html).toContain("nav.jobs");
    // Both report through the shared capture, tagged with their surface.
    expect(html).toContain('data-cta-id="landing_hero_signup"');
    expect(html).toContain('data-cta-id="landing_hero_jobs"');
    // Control: the counter sees a second primary when there is one.
    expect(countPrimary(`${html}${html}`)).toBe(2);
  });

  it("the page mounts the pair once in the hero and once as the closing band", () => {
    const focus = read("app/[locale]/focus-landing/focus-landing.tsx");
    const hero = focus.slice(
      focus.indexOf('<section className="flex flex-col gap-5">'),
      focus.indexOf("</section>"),
    );
    expect(hero.match(/<LandingPrimaryActions\b/g) ?? []).toHaveLength(1);
    expect(hero).toContain('surface="landing_hero"');
    // The pair sits OUTSIDE the entry, so the entry's own door scan
    // (landing-mobile-overflow.spec) still measures only the entry's doors.
    expect(hero.indexOf("<LandingPrimaryActions")).toBeLessThan(hero.indexOf("<PublicEntry"));
    expect(focus.indexOf("<LandingClosingBand")).toBeGreaterThan(focus.indexOf("<TrustBand"));
    // And still no per-request read: the landing stays static.
    const code = focus.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/cookies\(|headers\(/);
    expect(read("components/marketing/landing-primary-actions.tsx")).not.toMatch(
      /cookies\(|headers\(|getLocale\(/,
    );
  });

  /** The entry as a first-time visitor receives it: lt copy, no reading yet. */
  const renderEntry = async () => {
    const { PublicEntry } = await import("@/components/marketing/public-entry");
    // `children` goes as createElement's third argument (react/no-children-
    // prop); the props object is cast because the provider's type marks
    // `children` required on props.
    const props = {
      locale: "lt",
      messages: { landing: catalog("lt").landing },
    } as unknown as ComponentProps<typeof NextIntlClientProvider>;
    return renderToStaticMarkup(
      createElement(NextIntlClientProvider, props, createElement(PublicEntry, { supply: null })),
    );
  };

  it("the entry itself adds no primary action before a reading", async () => {
    const html = await renderEntry();
    // The doors (one of them primary) appear only after a reading, so the
    // hero's single primary action is the only one on the first screen.
    expect(countPrimary(html)).toBe(0);
  });

  it("at most FOUR example chips are mounted by default, and the rest are one tap away", async () => {
    const { DEFAULT_EXAMPLE_KEYS, EXAMPLE_KEYS, visibleExampleKeys } = await import(
      "@/components/marketing/public-entry"
    );
    const html = await renderEntry();
    const chips = html.match(/data-testid="entry-example"/g) ?? [];
    expect(chips.length).toBeLessThanOrEqual(4);
    expect(chips.length).toBe(DEFAULT_EXAMPLE_KEYS.length);
    expect(html).toContain('data-testid="entry-more-examples"');
    expect(html).toContain('aria-expanded="false"');

    // Reachable: the disclosure mounts EVERY catalogue example, the default
    // four still first, none twice, none missing.
    const all = visibleExampleKeys(true);
    expect([...all].sort()).toEqual([...EXAMPLE_KEYS].sort());
    expect(new Set(all).size).toBe(all.length);
    expect(all.slice(0, DEFAULT_EXAMPLE_KEYS.length)).toEqual([...DEFAULT_EXAMPLE_KEYS]);
    expect(visibleExampleKeys(false)).toEqual(DEFAULT_EXAMPLE_KEYS);
    // Every example the component knows is a sentence in every active
    // catalogue, so "reachable" means a real routed sentence, not a key.
    for (const loc of ACTIVE) {
      const examples = at(catalog(loc), "landing.entry.examples") as Record<string, string>;
      expect(Object.keys(examples).sort(), `${loc}: examples`).toEqual([...EXAMPLE_KEYS].sort());
      expect(at(catalog(loc), "landing.entry.moreExamples"), `${loc}: moreExamples`).toBeTypeOf(
        "string",
      );
    }
    // The chip both CI landing specs click stays first: the need-workers one.
    expect(DEFAULT_EXAMPLE_KEYS[0]).toBe("hire");
    // Control: the expanded set is larger than the cap, so the cap is real.
    expect(all.length).toBeGreaterThan(4);
  });

  it("the default four still span both sides of the market and more than hiring", () => {
    const entry = at(catalog("lt"), "landing.entry") as { examples: Record<string, string> };
    return import("@/components/marketing/public-entry").then(({ DEFAULT_EXAMPLE_KEYS }) => {
      const domains = new Set<string>();
      for (const key of DEFAULT_EXAMPLE_KEYS) {
        const reading = readPublicEntry(entry.examples[key]);
        expect(reading.kind, key).toBe("recognised");
        if (reading.kind === "recognised") {
          domains.add(INTENT_REGISTRY[reading.intent as RoutedIntent].domain);
        }
      }
      // Four chips that were all "find me a job" would reintroduce §16 on the
      // first screen; the default set must span at least three domains.
      expect(domains.size).toBeGreaterThanOrEqual(3);
    });
  });
});
