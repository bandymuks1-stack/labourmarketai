/**
 * S6 — kontekstinė atitiktis (doktrinos §19; spec
 * docs/product/s6-matching-fit-spec-note.md).
 *
 * Pure, DB-free, DETERMINISTIC: fit = |Y ∩ C| / |Y| over ESCO canonical
 * URIs — the need's required-skill set Y against the subject's skill set C.
 * Always returns the FULL basis object (which skills matched, which are
 * missing, which of the matched are manager-confirmed) — a % without its
 * basis does not exist (§19 b). Never persisted, never cached in tables —
 * computed at read time inside one need's context (§19 d). No need set →
 * null (an unstructured need shows NO percentage, ever).
 */

export interface SubjectEscoSkill {
  /** ESCO canonical URI. */
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
 *  (written ONLY by an explicit human act — intake pick or admin
 *  structuring; old requests stay unstructured until a human structures
 *  them, nothing is ever invented). */
export interface StructuredNeed {
  readonly escoOccupationUri: string | null;
  readonly escoSkillUris: readonly string[];
}

export function parseStructuredNeed(payload: unknown): StructuredNeed | null {
  if (!payload || typeof payload !== "object") return null;
  const raw = (payload as { structured_need?: unknown }).structured_need;
  if (!raw || typeof raw !== "object") return null;
  const uris = (raw as { esco_skill_uris?: unknown }).esco_skill_uris;
  if (!Array.isArray(uris)) return null;
  const skillUris = uris
    .filter((u): u is string => typeof u === "string")
    .map((u) => u.trim())
    .filter((u) => u !== "");
  if (skillUris.length === 0) return null;
  const occ = (raw as { esco_occupation_uri?: unknown }).esco_occupation_uri;
  return {
    escoOccupationUri: typeof occ === "string" && occ.trim() !== "" ? occ : null,
    escoSkillUris: [...new Set(skillUris)].sort(),
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
