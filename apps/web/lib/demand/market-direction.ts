/**
 * WHICH WAY THE MARKET IS FACING — the one rule, in one place.
 *
 * `customer_requests.kind` is not a category. It is the DIRECTION of a market
 * intent, and the two directions are opposites:
 *
 *   MAN REIKIA   "reikia 8 elektrikų nuo spalio"        → DEMAND
 *   AŠ TURIU     "turime 20 suvirintojų, ieškom darbo"  → SUPPLY
 *
 * Both sentences carry a role, a count, a country and a date, so a surface
 * that reads only those four columns cannot tell them apart — and every
 * surface that could not tell them apart got it wrong in exactly the same
 * way. Measured on production 2026-09-06:
 *
 *   * the worker opportunity board served 2 agency OFFERS as open jobs
 *     (the database half — `list_open_demand_for_workers` has no `kind`
 *     filter; owner-gated migration 20260906140000);
 *   * `loadCanonicalDemand`'s own-rows leg mapped an agency's own offer to a
 *     canonical demand row with `actionable: true`, so the agency's supply
 *     appeared on the shared market map as a need;
 *   * `listOwnCustomerRequests` dropped `kind` on the floor, so the company
 *     dashboard listed "we have 20 welders" under *what you asked for*.
 *
 * The last two are ordinary own-rows reads under `profile_id = auth.uid()`:
 * `kind` was always selectable and was simply never selected. They are fixed
 * here, above the database, with no migration and no new privilege.
 *
 * WHY CLOSED SETS AND A THIRD VALUE. The rule is a closed ALLOW-LIST per
 * direction, never a deny-list, and an unrecognised kind resolves to
 * `"other"` — NOT to demand and NOT to supply. A kind added tomorrow is
 * therefore invisible to both directions by DEFAULT and becomes visible only
 * by a deliberate edit here. Guessing a direction is the defect; refusing to
 * guess is the fix.
 *
 * `null` IS DEMAND, and that is required rather than defensive: rows written
 * by the original `save_customer_request` (migration 0028) predate the column
 * and are genuine worker-facing buyer demand. 1 such row is live; treating
 * null as unknown would delete the buyer spine from every demand surface.
 *
 * Pure — no `server-only`, no Supabase client — so the rule is unit-testable
 * without a database and is shared by the read modules rather than copied
 * into each of them.
 */

export type MarketDirection = "demand" | "supply" | "other";

/**
 * Someone NEEDS work done or people hired. A worker may act on it.
 * `customer_request` is the buyer-spine alias carried by the pre-`kind`
 * path's own filter and is kept so the two agree.
 */
const DEMAND_KINDS: ReadonlySet<string> = new Set([
  "company_request",
  "buyer_request",
  "customer_request",
]);

/**
 * Someone HAS people or capacity to offer. This is the other side of the
 * market: a worker must never be shown it as a vacancy, and an employer must
 * never see it counted among their own needs.
 */
const SUPPLY_KINDS: ReadonlySet<string> = new Set(["agency_offer"]);

/** The direction of one stored request. Never throws, never guesses. */
export function marketDirection(kind: string | null | undefined): MarketDirection {
  if (kind === null || kind === undefined) return "demand";
  const k = kind.trim();
  if (k === "") return "demand";
  if (DEMAND_KINDS.has(k)) return "demand";
  if (SUPPLY_KINDS.has(k)) return "supply";
  return "other";
}

/**
 * The demand kinds as a PostgREST `or` expression, for the reads that must
 * FILTER in the database rather than after it (a bounded `count`, which never
 * returns rows to classify). Built from the same set as `marketDirection`, so
 * the two can never drift: adding a demand kind above changes both.
 *
 * `kind.is.null` is part of the expression for the same reason `null` is
 * demand above — the pre-0028 buyer rows carry no kind and are real demand.
 */
export const DEMAND_KIND_OR_FILTER: string = [
  "kind.is.null",
  ...[...DEMAND_KINDS].map((k) => `kind.eq.${k}`),
].join(",");

/** True only for a row a demand surface may render. */
export function isDemandKind(kind: string | null | undefined): boolean {
  return marketDirection(kind) === "demand";
}

/** True only for a row a supply surface may render. */
export function isSupplyKind(kind: string | null | undefined): boolean {
  return marketDirection(kind) === "supply";
}
