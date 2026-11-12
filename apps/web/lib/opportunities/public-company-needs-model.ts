/**
 * Pure half of the public company needs read (owner decision V-1, 2026-11-12):
 * the row contract of `list_public_company_needs_v1` and the route status the
 * worker board uses for the same rule.
 *
 * Eligibility is NOT computed here — `need_public_state_v1` in the database is
 * the one rule. This file parses what the database returned, field by field,
 * and drops anything that does not match the contract.
 */

/** `list_open_demand_for_workers().route_status` for a need of a company that
 *  is not verified but passed the V-1 checks. Shown, labelled, never badged. */
export const UNCONFIRMED_COMPANY_ROUTE_STATUS = "unconfirmed_company";

/** True when a worker-board row belongs to a company that is not confirmed. */
export function isUnconfirmedCompanyRoute(routeStatus: string | null | undefined): boolean {
  return routeStatus === UNCONFIRMED_COMPANY_ROUTE_STATUS;
}

/** Exactly the nine columns the public reader returns — nothing else. */
export type PublicCompanyNeed = {
  readonly id: string;
  readonly roleText: string | null;
  readonly country: string | null;
  readonly locationLabel: string | null;
  readonly teamSize: number | null;
  readonly startPeriod: string | null;
  readonly createdAt: string | null;
  readonly companyName: string | null;
  readonly companyConfirmed: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

export function parsePublicCompanyNeedRows(data: unknown): PublicCompanyNeed[] {
  if (!Array.isArray(data)) return [];
  const out: PublicCompanyNeed[] = [];
  for (const raw of data) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== "string" || !UUID.test(r.id)) continue;
    out.push({
      id: r.id,
      roleText: str(r.role_text),
      country: str(r.country),
      locationLabel: str(r.location_label),
      teamSize: typeof r.team_size === "number" && Number.isFinite(r.team_size) ? r.team_size : null,
      startPeriod: str(r.start_period),
      createdAt: str(r.created_at),
      companyName: str(r.company_name),
      // Only an explicit true is "confirmed": anything else is labelled.
      companyConfirmed: r.company_confirmed === true,
    });
  }
  return out;
}

/** The closed set of states `get_my_need_public_states_v1` returns. */
export const NEED_PUBLIC_STATES = [
  "not_listed",
  "verified",
  "not_published",
  "unconfirmed_public",
  "held_incomplete",
  "held_review",
  "rejected",
] as const;
export type NeedPublicState = (typeof NEED_PUBLIC_STATES)[number];

/** The closed set of reasons the rule can give. */
export const NEED_PUBLIC_REASONS = [
  "missing_role",
  "missing_country",
  "missing_location",
  "missing_company_name",
  "missing_company_country",
  "company_draft",
  "link",
  "email",
  "phone",
  "contact_channel",
  "pitch",
  "rate",
  "duplicate_text",
  "disposable_email",
] as const;
export type NeedPublicReason = (typeof NEED_PUBLIC_REASONS)[number];

export function parseNeedPublicState(v: unknown): NeedPublicState | null {
  return typeof v === "string" && (NEED_PUBLIC_STATES as readonly string[]).includes(v)
    ? (v as NeedPublicState)
    : null;
}

export function parseNeedPublicReasons(v: unknown): NeedPublicReason[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (x): x is NeedPublicReason => typeof x === "string" && (NEED_PUBLIC_REASONS as readonly string[]).includes(x),
  );
}
