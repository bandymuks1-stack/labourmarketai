import type { MatchReason, MatchResultV1 } from "@/lib/market/match-v1";
import type { ExternalOpportunityCardV1 } from "@/lib/opportunities/external-vacancies";
import type { OpportunityCard } from "@/lib/opportunities/load-worker-opportunities";

/**
 * "YOUR OPPORTUNITIES" — the personal first view (owner addendum 2026-10-09).
 *
 * A deterministic, explainable selection over the board the worker ALREADY
 * loaded (platform needs + public ads, each already judged by the ONE match
 * engine). No new query, no paid AI, no second store:
 *
 *   - only RELEVANT opportunities qualify: the engine's `strong` or `possible`
 *     verdict. Weak / insufficient-data cards never fill a slot "to reach 3";
 *   - ranking: verdict, then the strength of the evidence behind the matched
 *     skills (manager-confirmed work, then the person's journal, then
 *     organization history), then place fit, then freshness;
 *   - the same ad listed twice (same title, employer and city) counts once;
 *   - every item carries ONE reason the engine actually found — never a
 *     percentage, never a reason the data does not support.
 */

export type PersonalWhy =
  | { readonly code: "profession_match" }
  | { readonly code: "skills_confirmed"; readonly count: number }
  | { readonly code: "skills_journal"; readonly count: number }
  | { readonly code: "skills_history"; readonly count: number }
  | { readonly code: "skill_fit"; readonly matched: number; readonly total: number }
  | { readonly code: "profession_related" }
  | { readonly code: "city_match" }
  | { readonly code: "country_match" };

export type PersonalOpportunity = {
  readonly kind: "demand" | "vacancy";
  readonly key: string;
  /** The id the detail route takes (demand id / vacancy id). */
  readonly id: string;
  readonly title: string;
  /** Work-type slug for a platform need (labelled by the page); null for an ad. */
  readonly roleSlug: string | null;
  /** Catalogue profession of an ad, when the import mapped one; the page
   *  leads with its name in the reader's language, the publisher's title below. */
  readonly professionSlug: string | null;
  readonly country: string | null;
  readonly place: string | null;
  readonly employer: string | null;
  readonly pay: { readonly currency: string | null; readonly min: number | null; readonly max: number | null } | null;
  readonly facts: {
    readonly employmentForm: string | null;
    readonly workingTime: string | null;
    readonly positions: number | null;
    readonly start: string | null;
  };
  readonly status: "strong" | "possible";
  readonly why: PersonalWhy;
  readonly publishedAt: string | null;
};

/** Free curated discovery set (owner addendum §4): a set, not a viewing quota. */
export const FREE_DISCOVERY_SET = 10;
/** The first view (owner addendum §2, §3). */
export const FIRST_VIEW_COUNT = 3;

const reasonCount = (reasons: readonly MatchReason[], code: MatchReason["code"]): number => {
  const r = reasons.find((x) => x.code === code) as { count?: number } | undefined;
  return r?.count ?? 0;
};
const has = (reasons: readonly MatchReason[], code: MatchReason["code"]) => reasons.some((x) => x.code === code);

/** The ONE reason shown — the strongest the engine actually found, in a fixed order. */
export function strongestWhy(match: MatchResultV1): PersonalWhy | null {
  const r = match.reasons;
  const confirmed = reasonCount(r, "skills_manager_confirmed");
  if (confirmed > 0) return { code: "skills_confirmed", count: confirmed };
  if (has(r, "profession_match")) return { code: "profession_match" };
  const journal = reasonCount(r, "skills_journal_supported");
  if (journal > 0) return { code: "skills_journal", count: journal };
  const history = reasonCount(r, "skills_history_reported");
  if (history > 0) return { code: "skills_history", count: history };
  const fit = r.find((x) => x.code === "skill_fit") as { matched: number; total: number } | undefined;
  if (fit && fit.matched > 0) return { code: "skill_fit", matched: fit.matched, total: fit.total };
  if (has(r, "profession_related")) return { code: "profession_related" };
  if (has(r, "city_match")) return { code: "city_match" };
  if (has(r, "country_match")) return { code: "country_match" };
  return null;
}

function evidenceScore(match: MatchResultV1): number {
  const e = match.evidence;
  return (
    (e.matchedManagerConfirmed ?? 0) * 100 +
    (e.matchedJournalSupported ?? 0) * 10 +
    (e.matchedHistorySignal ?? e.matchedOrganizationReported ?? 0) * 3 +
    (e.matchedSelfDeclared ?? 0)
  );
}

function placeScore(match: MatchResultV1): number {
  if (has(match.reasons, "city_match") || has(match.reasons, "location_within_radius")) return 2;
  if (has(match.reasons, "country_match") || has(match.reasons, "mobility_match")) return 1;
  return 0;
}

type Ranked = PersonalOpportunity & { readonly evidence: number; readonly placeFit: number };

export function fromDemand(card: OpportunityCard): Ranked | null {
  const status = card.match.status;
  if (status !== "strong" && status !== "possible") return null;
  const why = strongestWhy(card.match);
  if (!why) return null;
  const n = card.need;
  return {
    kind: "demand",
    key: `d:${n.id}`,
    id: n.id,
    title: "",
    roleSlug: n.roleText,
    professionSlug: null,
    country: n.country,
    place: n.locationLabel ?? null,
    employer: n.companyName ?? null,
    pay: null,
    facts: { employmentForm: n.opportunityType ?? null, workingTime: null, positions: n.teamSize, start: n.startPeriod },
    status,
    why,
    publishedAt: null,
    evidence: evidenceScore(card.match),
    placeFit: placeScore(card.match),
  };
}

export function fromVacancy(card: ExternalOpportunityCardV1): Ranked | null {
  const status = card.match.status;
  if (status !== "strong" && status !== "possible") return null;
  if (!card.vacancyId) return null;
  const why = strongestWhy(card.match);
  if (!why) return null;
  const v = card.view;
  const hasPay = v.payMin !== null || v.payMax !== null;
  return {
    kind: "vacancy",
    key: `v:${card.key}`,
    id: card.vacancyId,
    title: v.title,
    roleSlug: null,
    professionSlug: v.professionSlug,
    country: v.country,
    place: v.city,
    employer: v.employerName,
    pay: hasPay ? { currency: v.payCurrency, min: v.payMin, max: v.payMax } : null,
    facts: {
      employmentForm: v.employmentForm || null,
      workingTime: v.workingTime || null,
      positions: v.positions,
      start: v.startDate,
    },
    status,
    why,
    publishedAt: v.publishedAt,
    evidence: evidenceScore(card.match),
    placeFit: placeScore(card.match),
  };
}

const dedupeKey = (o: PersonalOpportunity) =>
  [o.kind, (o.title || o.roleSlug || "").trim().toLowerCase(), (o.employer ?? "").trim().toLowerCase(), (o.place ?? "").trim().toLowerCase()].join("|");

/** Rank, de-duplicate and cap. `limit` = FIRST_VIEW_COUNT or the discovery set. */
export function selectPersonalOpportunities(
  demands: readonly OpportunityCard[],
  vacancies: readonly ExternalOpportunityCardV1[],
  limit: number,
): PersonalOpportunity[] {
  const all = [
    ...demands.map(fromDemand),
    ...vacancies.map(fromVacancy),
  ].filter((x): x is Ranked => x !== null);
  all.sort(
    (a, b) =>
      (a.status === "strong" ? 0 : 1) - (b.status === "strong" ? 0 : 1) ||
      b.evidence - a.evidence ||
      b.placeFit - a.placeFit ||
      (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "") ||
      a.key.localeCompare(b.key),
  );
  const seen = new Set<string>();
  const out: PersonalOpportunity[] = [];
  for (const o of all) {
    const k = dedupeKey(o);
    if (seen.has(k)) continue;
    seen.add(k);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { evidence, placeFit, ...item } = o;
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}
