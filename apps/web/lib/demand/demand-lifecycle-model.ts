/**
 * Demand lifecycle — PURE model (PR10, Company/Demand launch slice).
 *
 * Two company-owned acts on the ONE canonical demand model
 * (`customer_requests`, §17):
 *
 *  1. CONFIRM RECOGNIZED NEED — the §19 "explicit human act" that upgrades a
 *     recognized-from-text requirement set into a human-structured need
 *     (`payload.structured_need.skill_slugs`). Recognition suggests; the
 *     company confirms; only then is the need structured.
 *  2. CLOSE / REOPEN — an honest visibility switch. The worker board RPC
 *     serves ONLY status='submitted' rows, so closing hides the demand from
 *     workers immediately; reopening restores it. No deletion, no history
 *     loss (§3).
 *
 * Transitions are a closed whitelist — nothing else moves through this path
 * (draft/in_review/needs_followup/approved stay admin-pipeline concerns).
 */

export const DEMAND_CLOSEABLE_STATUSES: readonly string[] = ["submitted"];
export const DEMAND_REOPENABLE_STATUSES: readonly string[] = ["closed"];

export function canCloseFrom(status: string | null | undefined): boolean {
  return DEMAND_CLOSEABLE_STATUSES.includes(status ?? "");
}

export function canReopenFrom(status: string | null | undefined): boolean {
  return DEMAND_REOPENABLE_STATUSES.includes(status ?? "");
}

/**
 * Merge a company-confirmed requirement set into the demand payload.
 * PRESERVES every other payload key (agency_offers, match_log, estimate,
 * accommodation, legacy esco fields …) — the payload is shared canonical
 * state, never overwritten wholesale.
 */
export function mergeConfirmedNeedPayload(
  payload: unknown,
  confirmed: {
    readonly skillSlugs: readonly string[];
    readonly professionSlug: string | null;
  },
): Record<string, unknown> {
  const base =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? { ...(payload as Record<string, unknown>) }
      : {};
  const prior =
    base.structured_need &&
    typeof base.structured_need === "object" &&
    !Array.isArray(base.structured_need)
      ? { ...(base.structured_need as Record<string, unknown>) }
      : {};
  return {
    ...base,
    structured_need: {
      ...prior,
      skill_slugs: [...new Set(confirmed.skillSlugs)].sort(),
      ...(confirmed.professionSlug ? { profession_slug: confirmed.professionSlug } : {}),
      confirmed_by: "company",
      confirmed_at_source: "recognized_from_text",
    },
  };
}
