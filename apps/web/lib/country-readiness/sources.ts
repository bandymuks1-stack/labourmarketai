/**
 * Country work-readiness — official SOURCE registry (Stage 3).
 *
 * Only recognised official EU / institutional bodies. Every requirement in
 * ./requirements.ts must reference a source defined HERE by id, so no readiness
 * statement can ever appear without a named, linkable official source. These
 * are the stable, canonical europa.eu / European Labour Authority entry points
 * for the EU posted-worker + free-movement framework — the genuinely official
 * substrate. Country-specific specifics that go beyond this framework are
 * marked `needs_legal_review` in the requirements, not asserted here.
 *
 * Pure data. No IO.
 */

import type { ReadinessSource, ReadinessSourceId } from "./types";

export const READINESS_SOURCES: Readonly<
  Record<ReadinessSourceId, ReadinessSource>
> = {
  eu_your_europe_citizens: {
    id: "eu_your_europe_citizens",
    title: "Your Europe — Citizens: working abroad",
    publisher: "European Union (Your Europe)",
    url: "https://europa.eu/youreurope/citizens/work/index_en.htm",
  },
  eu_your_europe_business: {
    id: "eu_your_europe_business",
    title: "Your Europe — Business: posting staff abroad",
    publisher: "European Union (Your Europe)",
    url: "https://europa.eu/youreurope/business/human-resources/posting-staff-abroad/posting-staff-abroad/index_en.htm",
  },
  eu_posting_ela: {
    id: "eu_posting_ela",
    title: "Posting of workers — national websites",
    publisher: "European Labour Authority (ELA)",
    url: "https://www.ela.europa.eu/en/posting-workers",
  },
  eu_social_security_a1: {
    id: "eu_social_security_a1",
    title: "Your Europe — Social security forms (A1 / posted workers)",
    publisher: "European Union (Your Europe)",
    url: "https://europa.eu/youreurope/citizens/work/social-security-forms/index_en.htm",
  },
  eu_eures: {
    id: "eu_eures",
    title: "EURES — the European job mobility portal",
    publisher: "European Labour Authority (EURES)",
    url: "https://eures.europa.eu/index_en",
  },
};

export function getReadinessSource(id: ReadinessSourceId): ReadinessSource {
  return READINESS_SOURCES[id];
}

export function isKnownReadinessSource(id: string): id is ReadinessSourceId {
  return Object.prototype.hasOwnProperty.call(READINESS_SOURCES, id);
}
