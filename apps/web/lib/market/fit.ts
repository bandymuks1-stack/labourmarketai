/**
 * S6 — kontekstinė atitiktis (doktrinos §19; spec
 * docs/product/s6-matching-fit-spec-note.md).
 *
 * Pure, DB-free, DETERMINISTIC: fit = |Y ∩ C| / |Y| over CANONICAL SKILL
 * IDS — the need's required-skill set Y against the subject's skill set C.
 * Always returns the FULL basis object (which skills matched, which are
 * missing, which of the matched are manager-confirmed) — a % without its
 * basis does not exist (§19 b). Never persisted, never cached in tables —
 * computed at read time inside one need's context (§19 d). No need set →
 * null (an unstructured need shows NO percentage, ever).
 *
 * CANONICAL IDENTITY (Matching PR4, 2026-07-04): the id is the catalogue
 * SKILL SLUG (`skills.slug` — present for 100% of rows). A legacy ESCO URI
 * is accepted as an opaque id for backward compatibility and is bridged to
 * its slug by the read layers when `skills.esco_uri` is curated. Matching
 * MUST NOT depend on `esco_uri` being non-null (prod reality at the
 * 2026-07-04 audit: 0/152 skills carried one, which made the previous
 * URI-keyed fit inert — see
 * runtime/audits/matching-scouting-reality-audit-2026-07-04.md. Re-verified
 * 2026-08-30: still 0, now of 161 skills — canonical numbers in
 * docs/LANGUAGE_MATRIX.md §4.1).
 */

export interface SubjectEscoSkill {
  /** Canonical skill id — the catalogue slug (legacy: an ESCO URI). */
  readonly uri: string;
  /** Manager-confirmed (worker_skills.verified) — NEVER inferred. */
  readonly verified: boolean;
}

export interface FitBasis {
  /** Rounded 0–100; pct = matchedTotal / needTotal. */
  readonly pct: number;
  readonly needTotal: number;
  readonly matchedTotal: number;
  /** How many of the matched skills are manager-confirmed (§19 c). */
  readonly matchedConfirmed: number;
  readonly matchedUris: readonly string[];
  readonly matchedConfirmedUris: readonly string[];
  readonly missingUris: readonly string[];
}

/** Deterministic contextual fit. Returns null when the need has no skills —
 *  no structure means no percentage (honest unstructured state). */
export function computeContextFit(
  needUris: readonly string[],
  subject: readonly SubjectEscoSkill[],
): FitBasis | null {
  const need = [...new Set(needUris.filter((u) => u.trim() !== ""))].sort();
  if (need.length === 0) return null;

  const confirmed = new Set(
    subject.filter((s) => s.verified).map((s) => s.uri),
  );
  const held = new Set(subject.map((s) => s.uri));

  const matchedUris = need.filter((u) => held.has(u));
  const matchedConfirmedUris = matchedUris.filter((u) => confirmed.has(u));
  const missingUris = need.filter((u) => !held.has(u));

  return {
    pct: Math.round((matchedUris.length / need.length) * 100),
    needTotal: need.length,
    matchedTotal: matchedUris.length,
    matchedConfirmed: matchedConfirmedUris.length,
    matchedUris,
    matchedConfirmedUris,
    missingUris,
  };
}

/** The structured need carried in customer_requests.payload.structured_need
 *  (written ONLY by an explicit human act — intake pick, admin structuring,
 *  or the company confirming a recognized suggestion; old requests stay
 *  unstructured until a human structures them, nothing is ever invented).
 *
 *  PR4 (2026-07-04): the SAME payload object additively carries canonical
 *  `skill_slugs` / `profession_slug` next to the legacy ESCO fields — one
 *  canonical structure extended, never a parallel one (§2/§17). */
export interface StructuredNeed {
  readonly escoOccupationUri: string | null;
  readonly escoSkillUris: readonly string[];
  /** Canonical catalogue skill slugs (preferred identity since PR4). */
  readonly skillSlugs: readonly string[];
  /** Canonical profession slug when the human structuring picked one. */
  readonly professionSlug: string | null;
}

const cleanStrings = (v: unknown): string[] =>
  Array.isArray(v)
    ? v
        .filter((u): u is string => typeof u === "string")
        .map((u) => u.trim())
        .filter((u) => u !== "")
    : [];

export function parseStructuredNeed(payload: unknown): StructuredNeed | null {
  if (!payload || typeof payload !== "object") return null;
  const raw = (payload as { structured_need?: unknown }).structured_need;
  if (!raw || typeof raw !== "object") return null;
  const skillUris = cleanStrings((raw as { esco_skill_uris?: unknown }).esco_skill_uris);
  const skillSlugs = cleanStrings((raw as { skill_slugs?: unknown }).skill_slugs);
  if (skillUris.length === 0 && skillSlugs.length === 0) return null;
  const occ = (raw as { esco_occupation_uri?: unknown }).esco_occupation_uri;
  const prof = (raw as { profession_slug?: unknown }).profession_slug;
  return {
    escoOccupationUri: typeof occ === "string" && occ.trim() !== "" ? occ : null,
    escoSkillUris: [...new Set(skillUris)].sort(),
    skillSlugs: [...new Set(skillSlugs)].sort(),
    professionSlug: typeof prof === "string" && prof.trim() !== "" ? prof : null,
  };
}

/** Agency "galim pasiūlyti" markers from payload.agency_offers (S5 RPC). */
export interface AgencyOfferMark {
  readonly agencyName: string | null;
  readonly markedAt: string | null;
  readonly note: string | null;
}

export function parseAgencyOffers(payload: unknown): AgencyOfferMark[] {
  if (!payload || typeof payload !== "object") return [];
  const raw = (payload as { agency_offers?: unknown }).agency_offers;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((o): o is Record<string, unknown> => !!o && typeof o === "object")
    .map((o) => ({
      agencyName: typeof o.agency_name === "string" ? o.agency_name : null,
      markedAt: typeof o.marked_at === "string" ? o.marked_at : null,
      note: typeof o.note === "string" ? o.note : null,
    }));
}
