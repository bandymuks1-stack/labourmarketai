import { describe, expect, it } from "vitest";

import { detectNeedProfession } from "@/lib/market/need-skills";
import { categorizeVacancy } from "@/lib/vacancy-sources/vacancy-categorization";

/**
 * SWEDISH VACANCY PROFESSION MAPPING — recovered where the catalogue supports it,
 * honestly unmapped everywhere else.
 *
 * ── THE MEASUREMENT, production 2026-09-27
 *
 * 30 049 of 53 392 active imported vacancies (56.3 %) carry no `profession_slug`.
 * That number reads like a broken importer. It is not:
 *
 *   svetsare 0 · elektriker 0 · snickare 0 · lärare 0 · kock 0
 *
 * ZERO unmapped ads for every trade the 49-slug catalogue actually holds. The
 * deterministic categorizer is doing its job across its whole scope.
 *
 * What the unmapped rows actually are: `Sjuksköterska, grundutbildad` (1 710),
 * `Utesäljare` (543), `Specialistläkare` (515), `Innesäljare` (373),
 * `Telefonförsäljare` (336), `Läkare` (254), `Inköpare` (254),
 * `Arbetsterapeut` (244), `Redovisningsekonom` (243), `Tandsköterska` (235),
 * `Projektledare, IT` (233), `Socialsekreterare` (224), `Psykolog` (214)…
 *
 * NONE of those is a slug in the catalogue. There is no `nurse`, `physician`,
 * `physiotherapist`, `psychologist`, `social_worker`, `accountant`, `buyer` or
 * `project_manager`. So the categorizer returns null CORRECTLY — and mapping
 * `Sjuksköterska` (a registered nurse) onto `caregiver` would state something
 * false about a person's qualification, which is SEP-6 and exactly the guessing
 * the owner forbade. Extending the catalogue is a product decision, not a
 * normalization repair.
 *
 * ── THE ONE GENUINE LEXICON GAP, AND WHY ONLY IT WAS CLOSED
 *
 * The vehicle-mechanic family was missing needles for a profession the catalogue
 * ALREADY has, so it is recovered — ~632 ads, 2.1 % of the unmapped set. That is
 * the whole recovery. It needs no data migration: categorization happens in the
 * parser and the repository upserts the parsed row on
 * `(provider_key, external_id)`, so the next import cycle re-derives these.
 */

/** Real `occupation_raw` values, with their production row counts. */
const RECOVERED: ReadonlyArray<readonly [string, number]> = [
  ["Däckmontör/Däck- och hjulmekaniker", 447],
  ["Däckmontör", 172],
  ["Bussmekaniker", 13],
];

/**
 * Real unmapped labels that must STAY unmapped. Two different reasons, and the
 * distinction is the point: the catalogue has no such profession, or the label
 * names a different trade from the one a nearby needle would claim.
 */
const MUST_STAY_UNMAPPED: readonly string[] = [
  // No such slug in the catalogue — healthcare, care qualifications.
  "Sjuksköterska, grundutbildad",
  "Specialistläkare",
  "Läkare",
  "Arbetsterapeut",
  "Fysioterapeut/Sjukgymnast",
  "Psykolog",
  "Tandsköterska",
  // No such slug — social work, finance, procurement, management.
  "Socialsekreterare",
  "Socionom",
  "Redovisningsekonom",
  "Inköpare",
  "Projektledare, IT",
  "Projektledare, bygg och anläggning",
  "Restaurangchef",
  // A DIFFERENT trade from automotive repair — industrial maintenance and
  // factory assembly. These sit closest to the needles just added, so they are
  // the ones that prove the addition did not overreach.
  "Underhållsmekaniker",
  "Maskinmekaniker",
  "Fordonsmontör",
  "Elektronikmontör",
  "Kylmontör/Kyltekniker",
  "Ventilationsmontör",
  "Industrirörmontör",
];

describe("the vehicle-mechanic family is recovered", () => {
  it.each(RECOVERED)("%s (%i ads) → auto_mechanic", (label) => {
    expect(detectNeedProfession(label)).toBe("auto_mechanic");
  });

  it("the whole pipeline maps them, with publisher origin", () => {
    // Through `categorizeVacancy`, not just the detector: the occupation label
    // is the publisher's own fact, so a hit there must be `publisher`-origin.
    const result = categorizeVacancy({
      titleRaw: "Vi söker en däckmontör till vår verkstad",
      descriptionRaw: "Du monterar och balanserar hjul.",
      occupationRaw: "Däckmontör/Däck- och hjulmekaniker",
    });
    expect(result.professionSlug).toBe("auto_mechanic");
    expect(result.origin).toBe("publisher");
  });

  it("diacritics do not decide it — the folded form matches too", () => {
    // `detectNeedProfession` folds both sides, so an import that arrives without
    // Swedish diacritics still maps rather than silently falling through.
    expect(detectNeedProfession("Dackmontor")).toBe("auto_mechanic");
  });
});

describe("everything the catalogue cannot name stays unmapped", () => {
  it.each(MUST_STAY_UNMAPPED)("%s → null", (label) => {
    // An invented mapping here would be worse than the honest gap: it would put
    // a profession a person does not hold onto a real advertisement.
    expect(detectNeedProfession(label)).toBeNull();
  });

  it("a nurse is never a caregiver", () => {
    // The single most tempting wrong mapping: 1 710 ads, and `caregiver` exists
    // with `undersköterska` (assistant nurse) among its needles. A registered
    // nurse holds a different, higher qualification — SEP-6. The needle must not
    // match the longer word, and the pipeline must not reach for it either.
    expect(detectNeedProfession("Sjuksköterska, grundutbildad")).toBeNull();
    const result = categorizeVacancy({
      titleRaw: "Sjuksköterska till akutmottagning",
      descriptionRaw: "Du arbetar med patienter i team.",
      occupationRaw: "Sjuksköterska, grundutbildad",
    });
    expect(result.professionSlug).toBeNull();
  });

  it("the honest outcome is NAMED, not an error", () => {
    // `unrecognized` is how the pipeline says "nothing was derivable", which the
    // module's own contract calls a common, honest result — never backfilled.
    const result = categorizeVacancy({
      titleRaw: "Specialistläkare inom internmedicin",
      descriptionRaw: "Legitimerad läkare med specialistkompetens.",
      occupationRaw: "Specialistläkare",
    });
    expect(result.professionSlug).toBeNull();
    expect(result.origin).toBe("derived");
  });
});
