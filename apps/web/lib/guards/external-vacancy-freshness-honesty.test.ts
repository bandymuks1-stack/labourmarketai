import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ExternalVacanciesSection } from "@/components/app/external-vacancies-section";
import {
  classifySourceFreshness,
  type SourceFreshnessV1,
} from "@/lib/vacancy-sources/source-freshness";
import type { ExternalOpportunityCardV1 } from "@/lib/opportunities/external-vacancies";

/**
 * STALE EXTERNAL SUPPLY IS NEVER SHOWN AS CURRENT.
 *
 * On 2026-08-12 production held 87 Swedish ads, 87/87 flagged `is_active`,
 * newest `last_seen_at` 2026-08-09T20:05Z, with the importer failing
 * `page_fetch_failed` since 2026-08-10. The board rendered all 87 with no
 * indication that nothing had been re-confirmed for two and a half days.
 * labourmarket.ai does not control these vacancies and cannot promise one is
 * still open, so this guard pins BOTH halves of the fix:
 *
 *   1. non-current supply RENDERS a notice (the regression is silence);
 *   2. the notice copy exists in every locale and stays worker-facing —
 *      no importer/cursor/HTTP jargon leaking into a job seeker's screen.
 */

const APP_ROOT = join(__dirname, "..", "..");
const ALL_LOCALES = [
  "en", "lt", "ru", "nl", "de",
  "pl", "lv", "et", "sv", "no", "da",
] as const;

const FRESHNESS_KEYS = [
  "freshnessDelayed",
  "freshnessStale",
  "freshnessUnknown",
  "freshnessUnavailable",
] as const;

type Json = Record<string, unknown>;
const load = (locale: string): Json =>
  JSON.parse(
    readFileSync(join(APP_ROOT, "messages", `${locale}.json`), "utf8"),
  ) as Json;

/** `opportunities.external` of one locale, as a flat string map. */
function externalNamespace(locale: string): Record<string, string> {
  const opportunities = load(locale).opportunities as Json | undefined;
  return (opportunities?.external ?? {}) as Record<string, string>;
}

/** One card, enough to make the section render at all. */
const CARD = {
  key: "arbetsformedlingen:ad-1",
  view: {
    title: "Snickare",
    description: "",
    employerName: "Bygg AB",
    country: "SE",
    city: "Stockholm",
    professionSlug: null,
    skillSlugs: [],
    languages: [],
    employmentForm: "permanent",
    workingTime: "full_time",
    positions: 1,
    startDate: null,
    publishedAt: "2026-08-01T00:00:00.000Z",
    payCurrency: null,
    payMin: null,
    payMax: null,
    provenance: {
      origin: "external_public_source",
      managementState: "unclaimed_external",
      attributionCode: "attr",
      originNoteCode: "origin",
      managementNoteCode: "mgmt",
      applicationRoute: "source_original",
      applicationUrl: "https://example.org/ad/1",
    },
  },
  capabilities: {
    canApplyInternally: false,
    canShortlistForEmployer: false,
    canBookThroughPlatform: false,
    canMessageEmployerInbox: false,
    mustShowSourceAttribution: true,
  },
  match: { blocking: [], strengths: [], negotiables: [], missingFacts: [] },
  matchingGaps: [],
} as unknown as ExternalOpportunityCardV1;

const LABELS = {
  sectionTitle: "External",
  sectionNote: "note",
  freshnessNotice: (f: SourceFreshnessV1) => `NOTICE:${f.state}`,
  openOriginal: "open",
  noApplicationRoute: "none",
  publishedOn: (d: string) => d,
  positionsLabel: (n: number) => String(n),
  payAsPublished: "pay",
  gapLabel: (g: string) => g,
  gapsTitle: "gaps",
  tierLabels: {} as never,
  attributionText: (c: string) => c,
  originNoteText: (c: string) => c,
  managementNoteText: (c: string) => c,
  skillLabel: (s: string) => s,
};

const renderWith = (freshness: SourceFreshnessV1) =>
  renderToStaticMarkup(
    createElement(ExternalVacanciesSection, {
      cards: [CARD],
      labels: LABELS as never,
      freshness,
    }),
  );

describe("the board states how old its external supply is", () => {
  it("renders NO notice while supply is current (a banner on healthy supply is noise)", () => {
    const html = renderWith(
      classifySourceFreshness({
        lastRefreshedAt: "2026-08-12T05:00:00.000Z",
        nowIso: "2026-08-12T06:00:00.000Z",
      }),
    );
    expect(html).toContain("external-vacancy-card");
    expect(html).not.toContain("external-freshness-notice");
  });

  /**
   * NEGATIVE CONTROL. Showing the real 2026-08-12 supply without a notice is
   * exactly the defect; if someone removes the notice, this fails.
   */
  it("renders a STALE notice for the real 2026-08-12 Swedish supply", () => {
    const freshness = classifySourceFreshness({
      lastRefreshedAt: "2026-08-09T20:05:32.975Z",
      nowIso: "2026-08-12T06:16:00.000Z",
    });
    expect(freshness.state).toBe("stale");

    const html = renderWith(freshness);
    expect(html).toContain("external-freshness-notice");
    expect(html).toContain('data-freshness-state="stale"');
    expect(html).toContain("NOTICE:stale");
    // The publisher route must survive the notice — attribution and the
    // original ad are never traded away for a warning.
    expect(html).toContain("https://example.org/ad/1");
  });

  it("renders a notice for every non-current state", () => {
    for (const state of ["delayed", "stale", "unknown", "unavailable"] as const) {
      const html = renderWith({
        state,
        lastRefreshedAt: null,
        ageHours: null,
      });
      expect(html, `${state} must warn`).toContain("external-freshness-notice");
      expect(html).toContain(`data-freshness-state="${state}"`);
    }
  });
});

describe("freshness copy is present and worker-facing in every locale", () => {
  /** Operator vocabulary that must never reach a job seeker (train §4). */
  const JARGON =
    /\b(importer|import session|cursor|service[_ ]role|RLS|HTTP|fetch|snapshot|endpoint|API|page_fetch_failed|null)\b/i;

  for (const locale of ALL_LOCALES) {
    it(`${locale}: carries all freshness keys, non-empty, jargon-free`, () => {
      const ext = externalNamespace(locale);
      expect(
        Object.keys(ext).length,
        `${locale}: opportunities.external missing`,
      ).toBeGreaterThan(0);

      for (const key of FRESHNESS_KEYS) {
        const value = ext[key];
        expect(typeof value, `${locale}.${key} must be a string`).toBe("string");
        expect(value.trim().length, `${locale}.${key} must not be empty`).toBeGreaterThan(0);
        expect(value, `${locale}.${key} leaks operator jargon`).not.toMatch(JARGON);
      }

      // The two dated states must actually interpolate the date, or the
      // sentence silently drops the only fact that makes it useful.
      expect(ext.freshnessDelayed, `${locale}.freshnessDelayed needs {date}`).toContain("{date}");
      expect(ext.freshnessStale, `${locale}.freshnessStale needs {date}`).toContain("{date}");
    });
  }
});
