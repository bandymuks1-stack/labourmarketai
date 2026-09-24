import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { PublicVacancyPreview } from "@/lib/vacancy-store/public-vacancy-preview";
import type { LiveMarketVacancySample } from "@/lib/market/live-market-landing";

/**
 * REAL OPEN JOBS ON THE LANDING — the board's rows, the board's card, nothing
 * else (owner directive 2026-09-23, PUBLIC_LANDING_REAL_JOB_DISCOVERY: "reuse
 * the canonical public jobs query/card/presentation … do not create a second
 * jobs implementation … do not accidentally expose gated fields").
 *
 * The privacy boundary is the database's — the anonymous preview function
 * never returns employer, place, contact, raw title or named source. What a
 * landing edit COULD still do is render something of its own around the
 * card. So this RENDERS the band and proves, on the markup:
 *
 *   1. each vacancy renders as EXACTLY the markup the unmodified
 *      <PublicVacancyCard> produces for it — no second presentation;
 *   2. a gated value smuggled onto a row object (as a regressed projection
 *      would deliver it) reaches no byte of the output;
 *   3. unavailable / empty renders NOTHING — never a placeholder board.
 */

vi.mock("@/lib/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: Record<string, unknown>) =>
    createElement("a", { href: String(href), ...rest }, children as ReactNode),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async (ns: string) =>
    Object.assign((k: string) => `${ns}.${k}`, {
      has: (k: string) => ns === "professions" && k !== "unknown_slug",
    }),
}));

vi.mock("@/components/marketing/reveal", () => ({
  Reveal: ({ children }: { children: ReactNode }) => children,
}));

const { LandingOpenJobsBand } = await import("@/components/marketing/landing-open-jobs-band");
const { PublicVacancyCard } = await import("@/components/marketing/public-vacancy-card");
const {
  publicVacancyCardFacts,
  PUBLIC_VACANCY_CARD_EMPLOYMENT_FORMS,
  PUBLIC_VACANCY_CARD_WORKING_TIMES,
} = await import("@/components/marketing/public-vacancy-card-facts");

const WEB = join(__dirname, "..", "..");

function vacancy(i: number, over: Partial<PublicVacancyPreview> = {}): PublicVacancyPreview {
  return {
    id: `22222222-2222-4222-8222-${String(i).padStart(12, "0")}`,
    title: null,
    professionSlug: "cook",
    occupation: "Kock",
    employmentForm: "permanent",
    workingTime: "full_time",
    positions: 2,
    compensationCurrency: null,
    compensationMin: null,
    compensationMax: null,
    sourceLanguage: "sv",
    attributionCode: null,
    publishedAt: "2026-09-20T00:00:00Z",
    ...over,
  };
}

/** Gated values a REGRESSED projection might carry — none may render. */
const GATED = {
  employerName: "CANARY_EMPLOYER_AB",
  city: "CANARY_CITY",
  region: "CANARY_REGION",
  country: "CANARY_COUNTRY",
  lat: 55.7047,
  lng: 13.191,
  applicationUrl: "https://canary.example/apply",
  contactEmail: "canary-contact@example.invalid",
  description: "CANARY_DESCRIPTION",
} as const;

async function render(sample: LiveMarketVacancySample, locale: "en" | "lt" = "en") {
  const out = await LandingOpenJobsBand({ sample, locale });
  return out ? renderToStaticMarkup(out) : "";
}

describe("the landing's open-jobs band is the board's card, not a second one", () => {
  const rows = [
    vacancy(1),
    vacancy(2, { professionSlug: "driver", occupation: "Chaufför" }),
    vacancy(3, { professionSlug: "unknown_slug", occupation: "Vaktmästare" }),
  ];

  it("renders each vacancy as exactly the canonical PublicVacancyCard markup", async () => {
    const html = await render({ basis: "live", vacancies: rows });
    for (const v of rows) {
      const card = renderToStaticMarkup(
        createElement(PublicVacancyCard, {
          vacancy: v,
          locale: "en",
          headingFallback:
            v.professionSlug && v.professionSlug !== "unknown_slug"
              ? `professions.${v.professionSlug}`
              : undefined,
        }),
      );
      expect(html, `vacancy ${v.id} is not the canonical card`).toContain(card);
    }
    expect(html.match(/data-testid="landing-open-job"/g)).toHaveLength(rows.length);
    // Each card links to the ONE public detail route.
    for (const v of rows) expect(html).toContain(`href="/jobs/${v.id}"`);
    // …and the band's own link is the whole board.
    expect(html).toContain('href="/jobs"');
  });

  it("an uncatalogued slug heads with the occupation, never the raw slug", async () => {
    const html = await render({ basis: "live", vacancies: rows });
    expect(html).not.toContain("unknown_slug");
    expect(html).toContain("Vaktmästare");
  });

  it("no gated field reaches the markup, even if a row object carried one", async () => {
    const smuggled = rows.map(
      (v) => ({ ...v, ...GATED, title: null, attributionCode: null }) as PublicVacancyPreview,
    );
    const html = await render({ basis: "live", vacancies: smuggled });
    for (const value of Object.values(GATED)) {
      expect(html, `gated value leaked: ${value}`).not.toContain(String(value));
    }
  });

  it("NEGATIVE CONTROL — the canary scan can see a value that IS rendered", async () => {
    // If the scan above could not find a rendered string, it would pass on
    // anything. The occupation is rendered, so the same scan must find it.
    const html = await render({ basis: "live", vacancies: [vacancy(9, { occupation: "CANARY_VISIBLE" })] });
    expect(html).toContain("CANARY_VISIBLE");
  });

  it("omits the whole band when the read was unavailable or the page empty", async () => {
    expect(await render({ basis: "unavailable", vacancies: [] })).toBe("");
    expect(await render({ basis: "unavailable", vacancies: rows })).toBe("");
    expect(await render({ basis: "live", vacancies: [] })).toBe("");
  });
});

/**
 * THE CARD'S PROJECTION IS WHAT THE CARD PAINTS. The landing's sample
 * selector skips a row whose card would look identical to one already chosen,
 * and it decides "identical" through `publicVacancyCardFacts` — a projection
 * the card exports, not a copy of its tables kept elsewhere. Review round 2 of
 * the 375px PR found the first fingerprint hashing the RAW employment form,
 * which the card paints only for three values; so this RENDERS the card over
 * every combination of the facts a row can vary and proves, pair by pair,
 * that two rows paint the same markup exactly when they project the same
 * facts. A projection that ignored a painted fact, or counted an unpainted
 * one, fails here.
 */
describe("publicVacancyCardFacts is exactly what the card paints", () => {
  const paint = (v: PublicVacancyPreview) =>
    renderToStaticMarkup(
      createElement(PublicVacancyCard, { vacancy: v, locale: "en", headingFallback: "professions.cook" }),
    );
  const variants: PublicVacancyPreview[] = [];
  for (const employmentForm of [null, "unknown", "assignment", "permanent", "temporary", "seasonal"])
    for (const workingTime of [null, "unknown", "shift", "full_time", "part_time"])
      for (const positions of [null, 1, 2])
        for (const publishedAt of ["2026-09-20T00:00:00Z", "2026-09-21T01:00:00+02:00", "2026-09-21T00:00:00Z"])
          variants.push(vacancy(1, { employmentForm, workingTime, positions, publishedAt }));

  it("two rows paint the same markup exactly when they project the same facts", () => {
    const painted = variants.map((v) => ({ html: paint(v), facts: JSON.stringify(publicVacancyCardFacts(v)) }));
    let same = 0;
    for (let a = 0; a < painted.length; a++) {
      for (let b = a + 1; b < painted.length; b++) {
        const sameFacts = painted[a].facts === painted[b].facts;
        const sameHtml = painted[a].html === painted[b].html;
        expect(sameHtml, `${painted[a].facts} vs ${painted[b].facts}`).toBe(sameFacts);
        if (sameFacts) same++;
      }
    }
    // The equivalence is not vacuous: unpainted values DO collapse (unknown,
    // assignment and null; 1 and null positions; the +02:00 stamp onto the
    // 20th), and painted ones DO NOT.
    expect(same).toBeGreaterThan(0);
    expect(new Set(painted.map((p) => p.facts)).size).toBe(4 * 3 * 2 * 2);
  });

  it("NEGATIVE CONTROL — the raw row is NOT what the card paints", () => {
    const a = vacancy(1, { employmentForm: "unknown" });
    const b = vacancy(1, { employmentForm: "assignment" });
    expect(a.employmentForm).not.toBe(b.employmentForm);
    expect(paint(a)).toBe(paint(b));
    expect(publicVacancyCardFacts(a)).toEqual(publicVacancyCardFacts(b));
    expect(publicVacancyCardFacts(a).employmentForm).toBeNull();
  });

  /**
   * The card is a waived product-gate surface bound to other PRs, so the key
   * sets are DECLARED beside it rather than exported by it. This reads the
   * card's own table keys from its source and pins the declaration to them,
   * so a label added to the card without a key added to the declaration
   * fails here as well as in the render above.
   */
  const card = readFileSync(join(WEB, "components/marketing/public-vacancy-card.tsx"), "utf8");
  /** The keys of a `const NAME: Record<string, L> = { key: {…}, … };` table. */
  const tableKeys = (source: string, start: string): string[] => {
    const from = source.indexOf(start);
    expect(from, `table ${start} not found in the card`).toBeGreaterThanOrEqual(0);
    const body = source.slice(from + start.length, source.indexOf("\n};", from));
    return [...body.matchAll(/^ {2}(\w+): \{/gm)].map((m) => m[1]);
  };

  it("the declared key sets are exactly the card's own table keys", () => {
    expect([...PUBLIC_VACANCY_CARD_EMPLOYMENT_FORMS].sort()).toEqual(
      tableKeys(card, "const EMPLOYMENT_FORM: Record<string, L> = {").sort(),
    );
    expect([...PUBLIC_VACANCY_CARD_WORKING_TIMES].sort()).toEqual(
      tableKeys(card, "const WORKING_TIME: Record<string, L> = {").sort(),
    );
    // Neither set is vacuous, and the card renders exactly these lookups.
    expect(PUBLIC_VACANCY_CARD_EMPLOYMENT_FORMS.length).toBeGreaterThan(0);
    expect(PUBLIC_VACANCY_CARD_WORKING_TIMES.length).toBeGreaterThan(0);
    expect(card).toContain("EMPLOYMENT_FORM[vacancy.employmentForm]?.[locale]");
    expect(card).toContain("WORKING_TIME[vacancy.workingTime]?.[locale]");
  });
});

describe("the band owns no vacancy logic of its own", () => {
  const band = readFileSync(join(WEB, "components/marketing/landing-open-jobs-band.tsx"), "utf8");
  const code = band.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("renders through PublicVacancyCard and reads no data itself", () => {
    expect(code).toContain('from "@/components/marketing/public-vacancy-card"');
    expect(code).toMatch(/<PublicVacancyCard\b/);
    // No reader, no client, no RPC, no cookie in the band: its rows arrive
    // from the ONE landing snapshot the page already resolved.
    expect(code).not.toMatch(/searchPublicVacancyPreviews|createClient|\.rpc\(|cookies\(|headers\(/);
  });

  it("is named a band, so the product gate reads it as a section, not a new card surface", () => {
    expect("landing-open-jobs-band.tsx").not.toMatch(/-card\.tsx$/);
  });

  it("the page mounts it between the market and the starting contexts", () => {
    const focus = readFileSync(join(WEB, "app/[locale]/focus-landing/focus-landing.tsx"), "utf8");
    const i = (c: string) => focus.search(new RegExp(`<${c}[\\s/>]`));
    expect(i("LandingOpenJobsBand")).toBeGreaterThan(focus.indexOf("</PublicMarketMapBand>"));
    expect(i("LandingOpenJobsBand")).toBeLessThan(i("StartingContextsBand"));
    expect(focus).toMatch(/<LandingOpenJobsBand sample=\{market\.sample\}/);
  });
});
