import { describe, expect, it } from "vitest";

import type { PublicVacancyPreview } from "@/lib/vacancy-store/public-vacancy-preview";
import {
  LANDING_VACANCY_SAMPLE_SIZE,
  landingVacancyFingerprint,
  pickLandingVacancySample,
} from "./live-market-landing";

/**
 * THE LANDING SAMPLE NEVER SHOWS TWO CARDS A VISITOR CANNOT TELL APART
 * (owner directive 2026-09-24, landing verified at 375px).
 *
 * Measured anonymously on production (375×812, 2026-09-23): the open-jobs
 * band rendered two cards reading "Sandėlio darbuotojas / Terminalarbetare /
 * Ne visa darbo diena / 10 vietos / 2026-09-23" — two different vacancies
 * that looked like one bug. The anonymous projection carries no employer,
 * place or raw title by owner directive (2026-08-24), so the card has no
 * distinguishing fact to add; the selector must instead skip a row whose
 * card would look identical to one already chosen.
 *
 * These fixtures reproduce that pair exactly, and the negative control below
 * proves the OLD selection (first four in order) would have shown it.
 */

function row(i: number, over: Partial<PublicVacancyPreview> = {}): PublicVacancyPreview {
  return {
    id: `33333333-3333-4333-8333-${String(i).padStart(12, "0")}`,
    title: null,
    professionSlug: "warehouse_worker",
    occupation: "Terminalarbetare",
    employmentForm: null,
    workingTime: "part_time",
    positions: 10,
    compensationCurrency: null,
    compensationMin: null,
    compensationMax: null,
    sourceLanguage: "sv",
    attributionCode: null,
    publishedAt: "2026-09-23T06:15:00Z",
    ...over,
  };
}

/** The production pair, then rows that each look different. */
const LOOKALIKE_PAGE: readonly PublicVacancyPreview[] = [
  row(1),
  // Same employer's second listing — a different vacancy, an identical card.
  row(2, { publishedAt: "2026-09-23T11:40:00Z" }),
  row(3, { professionSlug: "cook", occupation: "Kock", workingTime: "full_time", positions: 1 }),
  row(4, { professionSlug: "driver", occupation: "Chaufför", employmentForm: "permanent", positions: 1 }),
  row(5, { professionSlug: "teacher", occupation: "Lärare i grundskolan", positions: null }),
  row(6, { professionSlug: "cook", occupation: "Kock", workingTime: "full_time", positions: 1 }),
  row(7, { professionSlug: "electrician", occupation: "Elektriker", positions: 2 }),
];

const looks = (sample: readonly PublicVacancyPreview[]) =>
  sample.map(landingVacancyFingerprint);

describe("pickLandingVacancySample — distinct-looking rows only", () => {
  it("never picks two rows whose cards would look identical", () => {
    const sample = pickLandingVacancySample(LOOKALIKE_PAGE);
    expect(sample).toHaveLength(LANDING_VACANCY_SAMPLE_SIZE);
    expect(new Set(looks(sample)).size).toBe(sample.length);
    // The production pair: the first is kept, its look-alike is skipped, and
    // the next DIFFERENT rows fill the sample in the board's own order.
    expect(sample.map((v) => v.id.slice(-1))).toEqual(["1", "3", "4", "5"]);
  });

  it("NEGATIVE CONTROL — the pre-2026-09-24 selection showed the pair", () => {
    // What the selector used to do: slugged rows first, first four in order.
    const old = LOOKALIKE_PAGE.filter((v) => v.professionSlug).slice(0, LANDING_VACANCY_SAMPLE_SIZE);
    const seen = looks(old);
    expect(new Set(seen).size).toBeLessThan(old.length);
    expect(seen[0]).toBe(seen[1]);
  });

  it("keeps the board's order and the slugged-first preference", () => {
    const page = [
      row(1, { professionSlug: null, occupation: "Snickare" }),
      row(2, { professionSlug: "cook", occupation: "Kock" }),
      row(3, { professionSlug: null, occupation: null }),
      row(4, { professionSlug: "driver", occupation: "Chaufför" }),
    ];
    expect(pickLandingVacancySample(page).map((v) => v.id.slice(-1))).toEqual(["2", "4", "1"]);
  });

  it("is SHORTER, never padded with a look-alike, when the page has fewer distinct looks", () => {
    const page = [row(1), row(2), row(3), row(4, { professionSlug: "cook", occupation: "Kock" })];
    const sample = pickLandingVacancySample(page);
    expect(sample.map((v) => v.id.slice(-1))).toEqual(["1", "4"]);
    expect(sample.length).toBeLessThan(LANDING_VACANCY_SAMPLE_SIZE);
  });

  it("an empty page is an empty sample", () => {
    expect(pickLandingVacancySample([])).toEqual([]);
  });
});

describe("landingVacancyFingerprint — exactly what the anonymous card paints", () => {
  const base = row(1);

  it("differs on every fact the card renders", () => {
    const f = landingVacancyFingerprint(base);
    for (const over of [
      { professionSlug: "cook" },
      { occupation: "Lagerarbetare" },
      { employmentForm: "temporary" },
      { workingTime: "full_time" },
      { positions: 3 },
      { publishedAt: "2026-09-22T23:59:00Z" },
    ] satisfies Partial<PublicVacancyPreview>[]) {
      expect(landingVacancyFingerprint(row(1, over)), JSON.stringify(over)).not.toBe(f);
    }
  });

  it("ignores what the card does NOT render — the id, the time of day, compensation, one position", () => {
    const f = landingVacancyFingerprint(base);
    expect(landingVacancyFingerprint(row(2))).toBe(f);
    expect(landingVacancyFingerprint(row(1, { publishedAt: "2026-09-23T23:59:59Z" }))).toBe(f);
    expect(
      landingVacancyFingerprint(
        row(1, { compensationCurrency: "SEK", compensationMin: 30000, compensationMax: 34000 }),
      ),
    ).toBe(f);
    // The card prints the positions chip only above one, so 1 and null look alike.
    expect(landingVacancyFingerprint(row(1, { positions: 1 }))).toBe(
      landingVacancyFingerprint(row(1, { positions: null })),
    );
  });

  it("a row heading with its occupation (no slug) is distinct from a slugged row of the same occupation", () => {
    // The card heads the slugged row with the profession name in the reader's
    // language and the unslugged row with the publisher's occupation words.
    expect(landingVacancyFingerprint(row(1, { professionSlug: null }))).not.toBe(
      landingVacancyFingerprint(base),
    );
  });
});
