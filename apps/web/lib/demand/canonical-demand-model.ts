/**
 * CANONICAL DEMAND — the pure half.
 *
 * Normalisation, dedup identity and ordering live here with no `server-only`
 * import and no Supabase client, so every honesty rule below is unit-testable
 * without a database. The IO half is `./canonical-demand.ts`.
 *
 * The rules this file enforces, all of them "do not invent":
 *   * a missing quantity stays `null` — never 1, never 0;
 *   * a missing country or city stays `null` — never a centroid, never a guess;
 *   * blank/whitespace text normalises to `null` rather than to `""`, so a
 *     surface cannot render an empty label as if it were a real one;
 *   * a non-positive quantity is not real demand and is dropped to `null`.
 */

export type CanonicalDemandSource = "customer_request" | "job_demand";

export interface CanonicalDemand {
  /**
   * Dedup identity. `${source}:${id}` — the two stores have independent id
   * spaces, so the source must be part of the key. One canonical demand
   * produces exactly one entry even when two authorized branches return it
   * (an employer who is also a worker reaches their own request through both
   * the RPC and the own-rows read).
   */
  readonly key: string;
  readonly id: string;
  readonly source: CanonicalDemandSource;
  /**
   * TRUE only when a worker can actually act on this row (express interest →
   * booking). `customer_request` rows are actionable; historical `job_demand`
   * rows are not, and a surface must not imply an apply/booking path for them.
   */
  readonly actionable: boolean;
  /** ISO-3166 alpha-2, upper-cased. `null` when the source has none. */
  readonly country: string | null;
  /** Free-text place label. `null` when the source has none. */
  readonly cityLabel: string | null;
  /** People needed. `null` means UNKNOWN — never rendered as a number. */
  readonly quantity: number | null;
  readonly roleText: string | null;
  /**
   * The organisation behind the demand, WHEN THE SOURCE ALREADY DISCLOSES IT.
   *
   * This carries no new privilege. `list_open_demand_for_workers` is a
   * SECURITY DEFINER function with a worker-only caller gate that already
   * returns `company_name`, and only for a company whose
   * `verification_status = 'verified'`; this field is that column, unchanged.
   * The employer's own-rows branch has no company column in its select, so it
   * contributes `null` and the surface states the gap.
   *
   * `null` means "not disclosed by the branch that answered", NEVER "no
   * organisation". A surface renders it as an explicit gap, never as a guess
   * and never by borrowing a name from the viewer's own workspace.
   */
  readonly organizationName: string | null;
  /**
   * TRUE when this demand is the VIEWER'S OWN — it came back through the
   * own-rows branch, the one scoped by RLS to the signed-in user's own rows.
   *
   * It is provenance, not a permission: nothing is unlocked by setting it. It
   * exists so a surface can offer the caller an action on their OWN need
   * (scouting their demand) without offering it over someone else's row, where
   * the action would dead-end in `not-found`. The worker RPC branch sets it
   * false — that branch returns other tenants' demand by design.
   */
  readonly ownedByViewer: boolean;
  readonly createdAt: string | null;
}

export type CanonicalDemandResult =
  | { readonly state: "ok"; readonly rows: readonly CanonicalDemand[] }
  | { readonly state: "error"; readonly errorCode: string };

function text(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Quantity is real or it is unknown. A non-integer, zero or negative headcount
 * describes no one, so it becomes `null` ("not stated") rather than a number a
 * surface would happily print.
 */
function quantity(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}

export interface CanonicalDemandInput {
  readonly id: string | null | undefined;
  readonly source: CanonicalDemandSource;
  readonly actionable: boolean;
  readonly country: string | null | undefined;
  readonly cityLabel: string | null | undefined;
  readonly quantity: number | null | undefined;
  readonly roleText: string | null | undefined;
  /** Only ever the disclosing branch's own column — see `CanonicalDemand`. */
  readonly organizationName?: string | null | undefined;
  /** True ONLY on the own-rows branch. Defaults false — see `CanonicalDemand`. */
  readonly ownedByViewer?: boolean | undefined;
  readonly createdAt: string | null | undefined;
}

/** Normalise one source row. Returns `null` for a row with no usable id. */
export function toCanonicalDemand(input: CanonicalDemandInput): CanonicalDemand | null {
  const id = text(input.id);
  if (!id) return null;

  const country = text(input.country);
  return {
    key: `${input.source}:${id}`,
    id,
    source: input.source,
    actionable: input.actionable,
    country: country ? country.toUpperCase() : null,
    cityLabel: text(input.cityLabel),
    quantity: quantity(input.quantity),
    roleText: text(input.roleText),
    organizationName: text(input.organizationName),
    ownedByViewer: input.ownedByViewer === true,
    createdAt: text(input.createdAt),
  };
}

/**
 * Collapse to one row per canonical demand, in a stable order.
 *
 * DEDUP KEEPS THE ACTIONABLE ROW. When the same request arrives from two
 * authorized branches, the one that grants a real next step wins; otherwise
 * the first occurrence is kept. Dropping to the non-actionable copy would
 * silently remove a worker's ability to act on a live need.
 *
 * AND IT MERGES THE FACTS, RATHER THAN PICKING A WINNER. An employer who is also
 * a worker reaches their own request through BOTH branches, and the branches
 * know different things about the SAME row: the worker RPC discloses the
 * verified company name, the own-rows read knows the row is the viewer's own.
 * Keeping whichever arrived first would make the name — or the ownership —
 * appear and vanish with branch order.
 *
 * Merging is safe precisely because the key is `source:id`: two entries under
 * one key are the same row in the same store, seen through two paths the caller
 * was ALREADY authorized to use. So this discloses nothing new; it just stops
 * throwing away half of what those paths returned. (A `job_demand` and a
 * `customer_request` that share a uuid have different keys and never merge.)
 *
 * ORDER IS TOTAL AND DATA-INDEPENDENT — country (unknown last), then city
 * (unknown last), then source, then id. `id` is the final tiebreak so the
 * sequence never depends on the order the branches happened to return.
 */
export function dedupeCanonicalDemand(
  rows: readonly CanonicalDemand[],
): readonly CanonicalDemand[] {
  const byKey = new Map<string, CanonicalDemand>();
  for (const row of rows) {
    const existing = byKey.get(row.key);
    if (!existing) {
      byKey.set(row.key, row);
      continue;
    }
    // Actionability comes from the copy that grants a real next step; the
    // FACTS are merged from both.
    const base = !existing.actionable && row.actionable ? row : existing;
    const other = base === existing ? row : existing;
    byKey.set(row.key, {
      ...base,
      organizationName: base.organizationName ?? other.organizationName,
      ownedByViewer: base.ownedByViewer || other.ownedByViewer,
    });
  }

  const nullsLast = (a: string | null, b: string | null): number => {
    if (a === b) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return a < b ? -1 : 1;
  };

  return [...byKey.values()].sort(
    (a, b) =>
      nullsLast(a.country, b.country) ||
      nullsLast(a.cityLabel, b.cityLabel) ||
      (a.source < b.source ? -1 : a.source > b.source ? 1 : 0) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/**
 * The rows that may become map geography: a country is required.
 *
 * A demand with no country is REAL demand — it is simply not placeable. It is
 * withheld from the map rather than given a centroid, because a pin is a claim
 * about where the work is and we do not have one to make.
 */
export function placeableDemand(
  rows: readonly CanonicalDemand[],
): readonly CanonicalDemand[] {
  return rows.filter((row) => row.country !== null);
}
