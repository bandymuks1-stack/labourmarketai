/**
 * OFFERING A TEAM / BRIGADE AGAINST ONE DEMAND — the pure model (owner decision E6).
 *
 * No IO, no Supabase, no "use server". Everything here is a total function over
 * the RPC rows of migration 20261007150000_team_demand_offer_v1, so the privacy
 * boundary can be pinned by a unit test:
 *
 *   - the receiving side's row type has NO member identity field (no profile id,
 *     no worker id, no name). It cannot be added without breaking the guard;
 *   - the TeamMatchInputV1 handed to `matchTeamToNeed` is built from those
 *     aggregates alone, so the matcher runs on the `team_aggregate` basis — a
 *     per-member result is, by construction, unreachable on this surface.
 *
 * UNKNOWN IS NOT ZERO (SEP-7): a team that never filled in team_details has
 * `availability: unknown`, not `not_available`; a skill list that is empty is a
 * stated missing fact in the matcher, never "this team has no skills".
 */

import type { MatchStatus } from "./match-v1";
import type { TeamMatchResultV1 } from "./match-team-v1";
import type { TeamMatchInputV1 } from "./team-match-contract";

export type TeamOfferStatus = "offered" | "accepted" | "declined" | "withdrawn" | "assigned";

/** One offer as the RECEIVING organisation may read it: team-level facts only. */
export interface ReceivedTeamOffer {
  readonly offerId: string;
  readonly teamId: string;
  readonly teamName: string;
  readonly status: TeamOfferStatus;
  readonly note: string | null;
  readonly offeredAt: string;
  readonly respondedAt: string | null;
  /** Set once the unit is on a project; the existing resolver then names members. */
  readonly assignmentId: string | null;
  readonly memberCount: number;
  readonly deployableMin: number | null;
  readonly deployableMax: number | null;
  /** null = the team never filled in its details (unknown, not "unavailable"). */
  readonly availabilityStatus: "available_now" | "available_from" | "not_available" | null;
  readonly availableFrom: string | null;
  readonly destinationCountries: readonly string[] | null;
  readonly accommodationNeeded: boolean | null;
  readonly transportOwn: boolean | null;
  readonly detailsUpdatedAt: string | null;
  readonly skills: ReadonlyArray<{ slug: string; declared: number; confirmed: number }>;
  readonly languages: ReadonlyArray<{ code: string; level: string | null; count: number }>;
  readonly consentedMembers: number;
}

/** One of the caller's OWN offers (the offering side). */
export interface SentTeamOffer {
  readonly offerId: string;
  readonly requestId: string;
  readonly roleText: string | null;
  readonly country: string | null;
  readonly companyName: string | null;
  readonly status: TeamOfferStatus;
  readonly offeredAt: string;
  readonly respondedAt: string | null;
  readonly assignmentId: string | null;
}

/** An open demand a team's manager may offer against (the worker-board whitelist). */
export interface OfferableDemand {
  readonly requestId: string;
  readonly roleText: string | null;
  readonly country: string | null;
  readonly teamSize: number | null;
  readonly startPeriod: string | null;
  readonly companyName: string | null;
  readonly openOfferId: string | null;
  readonly openOfferStatus: TeamOfferStatus | null;
}

const STATUSES: readonly TeamOfferStatus[] = ["offered", "accepted", "declined", "withdrawn", "assigned"];
const isStatus = (v: unknown): v is TeamOfferStatus => STATUSES.includes(v as TeamOfferStatus);
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

type Row = Record<string, unknown>;
const isRow = (v: unknown): v is Row => typeof v === "object" && v !== null && !Array.isArray(v);

export function parseReceivedOffer(raw: unknown): ReceivedTeamOffer | null {
  if (!isRow(raw)) return null;
  const offerId = str(raw.offer_id);
  const teamId = str(raw.team_org_id);
  if (!offerId || !teamId || !isStatus(raw.status)) return null;
  const avail = raw.availability_status;
  const skills = Array.isArray(raw.skills) ? raw.skills : [];
  const languages = Array.isArray(raw.languages) ? raw.languages : [];
  return {
    offerId,
    teamId,
    teamName: str(raw.team_name) ?? "",
    status: raw.status,
    note: str(raw.note),
    offeredAt: str(raw.offered_at) ?? "",
    respondedAt: str(raw.responded_at),
    assignmentId: str(raw.assignment_id),
    memberCount: num(raw.member_count) ?? 0,
    deployableMin: num(raw.deployable_min),
    deployableMax: num(raw.deployable_max),
    availabilityStatus:
      avail === "available_now" || avail === "available_from" || avail === "not_available" ? avail : null,
    availableFrom: str(raw.available_from),
    destinationCountries: Array.isArray(raw.destination_countries)
      ? raw.destination_countries.filter((c): c is string => typeof c === "string")
      : null,
    accommodationNeeded: typeof raw.accommodation_needed === "boolean" ? raw.accommodation_needed : null,
    transportOwn: typeof raw.transport_own === "boolean" ? raw.transport_own : null,
    detailsUpdatedAt: str(raw.details_updated_at),
    skills: skills.flatMap((s) =>
      isRow(s) && str(s.slug)
        ? [{ slug: s.slug as string, declared: num(s.declared) ?? 0, confirmed: num(s.confirmed) ?? 0 }]
        : [],
    ),
    languages: languages.flatMap((l) =>
      isRow(l) && str(l.code) ? [{ code: l.code as string, level: str(l.level), count: num(l.count) ?? 0 }] : [],
    ),
    consentedMembers: num(raw.consented_members) ?? 0,
  };
}

export function parseSentOffer(raw: unknown): SentTeamOffer | null {
  if (!isRow(raw)) return null;
  const offerId = str(raw.offer_id);
  const requestId = str(raw.request_id);
  if (!offerId || !requestId || !isStatus(raw.status)) return null;
  return {
    offerId,
    requestId,
    roleText: str(raw.role_text),
    country: str(raw.country),
    companyName: str(raw.company_name),
    status: raw.status,
    offeredAt: str(raw.offered_at) ?? "",
    respondedAt: str(raw.responded_at),
    assignmentId: str(raw.assignment_id),
  };
}

export function parseOfferableDemand(raw: unknown): OfferableDemand | null {
  if (!isRow(raw)) return null;
  const requestId = str(raw.request_id);
  if (!requestId) return null;
  return {
    requestId,
    roleText: str(raw.role_text),
    country: str(raw.country),
    teamSize: num(raw.team_size),
    startPeriod: str(raw.start_period),
    companyName: str(raw.company_name),
    openOfferId: str(raw.open_offer_id),
    openOfferStatus: isStatus(raw.open_offer_status) ? raw.open_offer_status : null,
  };
}

const FRESH_DAY_MS = 24 * 60 * 60 * 1000;
function freshnessBucket(updatedAt: string | null, now: number): TeamMatchInputV1["dataFreshness"]["bucket"] {
  if (!updatedAt) return "unknown";
  const age = now - Date.parse(updatedAt);
  if (!Number.isFinite(age)) return "unknown";
  if (age < 7 * FRESH_DAY_MS) return "active";
  if (age < 30 * FRESH_DAY_MS) return "recent";
  return "dormant";
}

/**
 * The canonical `TeamMatchInputV1` (lib/market/team-match-contract.ts) built
 * from the aggregates an offer discloses — and from nothing else. Handing this
 * to `matchTeamToNeed` WITHOUT member subjects forces the `team_aggregate`
 * basis: per-member eligibility stays honestly unknown (null), never guessed.
 */
export function offerToTeamMatchInput(offer: ReceivedTeamOffer, now: number = Date.now()): TeamMatchInputV1 {
  const hasDetails = offer.detailsUpdatedAt !== null;
  return {
    teamId: offer.teamId,
    activeMemberCount: offer.memberCount,
    deployableSize: { min: offer.deployableMin, max: offer.deployableMax },
    professionComposition: [],
    skillComposition: offer.skills.map((s) => ({
      slug: s.slug,
      membersDeclared: s.declared,
      membersConfirmed: s.confirmed,
    })),
    languageComposition: offer.languages.map((l) => ({ code: l.code, level: l.level, memberCount: l.count })),
    // No structured certification data exists today: not derivable, never "satisfied".
    certificationCoverage: null,
    availability: hasDetails && offer.availabilityStatus
      ? { status: offer.availabilityStatus, availableFrom: offer.availableFrom }
      : { status: "unknown", availableFrom: null },
    destinationCountries: hasDetails ? (offer.destinationCountries ? [...offer.destinationCountries] : null) : null,
    accommodationNeeded: hasDetails ? offer.accommodationNeeded : null,
    transport: { ownTransport: hasDetails ? offer.transportOwn : null },
    memberConsentCompleteness: { consentedMembers: offer.consentedMembers, totalMembers: offer.memberCount },
    dataFreshness: { updatedAt: offer.detailsUpdatedAt, bucket: freshnessBucket(offer.detailsUpdatedAt, now) },
    // Disclosed to ONE demand owner by the team's own manager; not published.
    visibilityState: "private",
  };
}

// ── Refusals ────────────────────────────────────────────────────────────────

export type TeamOfferRefusal =
  | "not_authed"
  | "not_authorized"
  | "demand_not_offerable"
  | "team_too_small"
  | "previously_declined"
  | "offer_limit_reached"
  | "offer_not_open"
  | "offer_not_accepted"
  | "demand_closed"
  | "project_not_of_demand_owner"
  | "project_completed"
  | "task_not_assignable"
  | "object_not_assignable"
  | "one_scope_only"
  | "team_has_no_members"
  | "project_required"
  | "invalid_decision"
  | "needs_migration"
  | "error";

const STABLE_WORDS: readonly TeamOfferRefusal[] = [
  "demand_not_offerable",
  "team_too_small",
  "previously_declined",
  "offer_limit_reached",
  "offer_not_open",
  "offer_not_accepted",
  "demand_closed",
  "project_not_of_demand_owner",
  "project_completed",
  "task_not_assignable",
  "object_not_assignable",
  "one_scope_only",
  "team_has_no_members",
  "project_required",
  "invalid_decision",
];

const MISSING_CODES = new Set(["42P01", "42703", "42883", "PGRST202", "PGRST205"]);

/** Map a PostgREST/Postgres error onto the closed refusal vocabulary. */
export function offerRefusalOf(error: { code?: string | null; message?: string | null } | null | undefined): TeamOfferRefusal {
  if (!error) return "error";
  const message = error.message ?? "";
  if (error.code && MISSING_CODES.has(error.code)) return "needs_migration";
  if (/Not authenticated/i.test(message)) return "not_authed";
  for (const word of STABLE_WORDS) if (message.includes(word)) return word;
  if (error.code === "42501" || /Not authorized/i.test(message)) return "not_authorized";
  return "error";
}

export type OfferWriteOutcome = "created" | "already_offered";
export function parseOfferResult(data: unknown): { outcome: OfferWriteOutcome; offerId: string } | null {
  if (!isRow(data)) return null;
  const offerId = str(data.offer_id);
  if (!offerId) return null;
  return { outcome: data.outcome === "already_offered" ? "already_offered" : "created", offerId };
}

export function parseHandOffResult(data: unknown): { outcome: "created" | "already_assigned"; assignmentId: string } | null {
  if (!isRow(data)) return null;
  const assignmentId = str(data.assignment_id);
  if (!assignmentId) return null;
  return { outcome: data.outcome === "already_assigned" ? "already_assigned" : "created", assignmentId };
}

// ── The match, as the receiving side is shown it ───────────────────────────

/**
 * The serializable face of a `matchTeamToNeed` result for the employer-side
 * section. Always the `team_aggregate` basis here (no member subjects are ever
 * read on this surface), and the basis is carried so the screen can name it
 * (section 19: no figure without its basis). There is NO global team score.
 */
export interface OfferMatchView {
  readonly status: MatchStatus;
  readonly basis: TeamMatchResultV1["basis"];
  /** need skills the team declares (>= 1 member), over the need's skill total; null when not computable. */
  readonly coveredCount: number | null;
  readonly needTotal: number | null;
  readonly skillCoverage: ReadonlyArray<{ skillId: string; members: number }>;
  /** Hard criteria the team as a whole cannot meet (both sides stated). */
  readonly blockers: readonly string[];
  /** Facts nobody stated - shown as missing, never as a match or a mismatch. */
  readonly missing: readonly string[];
  readonly missingData: readonly string[];
}

export function summarizeTeamMatch(result: TeamMatchResultV1): OfferMatchView {
  return {
    status: result.status,
    basis: result.basis,
    coveredCount: result.coverage?.coveredCount ?? null,
    needTotal: result.coverage?.needTotal ?? null,
    skillCoverage: (result.coverage?.entries ?? []).map((e) => ({ skillId: e.skillId, members: e.totalMembers })),
    blockers: [...new Set(result.setBlockers.map((b) => b.criterion))],
    missing: [...new Set(result.missingFacts.map((m) => m.criterion))],
    missingData: [...result.missingData],
  };
}
