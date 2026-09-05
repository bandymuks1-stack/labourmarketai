import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireEmployerCompany } from "@/lib/company/employer-company-context";
import {
  toCanonicalDemand,
  type CanonicalDemand,
  type CanonicalDemandResult,
} from "./canonical-demand-model";

/**
 * THE CANONICAL DEMAND READ — one contract, one live store.
 *
 * THE DEFECT THIS CLOSES (W10 slice 4). The platform carried TWO independent
 * demand truths and no link between them:
 *
 *   * `customer_requests` — what an employer actually creates. It feeds the
 *     employer workflow, the worker board (via the gated SECURITY DEFINER RPC
 *     `list_open_demand_for_workers`), scouting and booking.
 *   * `job_demands` — project-scoped rows. It fed the market map, and NOTHING
 *     ELSE that a customer touches.
 *
 * So an employer could submit a real need and the map — reading the other
 * table — would show no demand at all. Two surfaces, two answers, both
 * presented as "the market". This module made both surfaces read ONE list.
 *
 * CONSOLIDATION SLICE 1 (2026-08-17): the legacy `job_demands` leg was
 * removed from this reader. The table has held 0 rows in production for its
 * whole life and nothing writes it, so the leg only ever contributed an empty
 * set; its schema stays frozen and undropped
 * (docs/audits/duplication-freeze-register-2026-08-17.md). The contract —
 * `source` + `actionable` on every row — is unchanged, so a future second
 * source must still declare itself honestly.
 *
 * WHY A READ MODULE AND NOT A SQL VIEW. A view would need its own migration,
 * its own RLS/security-barrier reasoning, and it still could not express the
 * worker path: `list_open_demand_for_workers` is SECURITY DEFINER with a
 * worker-only caller gate, so a view could not call it without either
 * duplicating its whitelist (a second projection to drift) or widening
 * `customer_requests` RLS (a real privilege change). Composing the paths that
 * are ALREADY authorized adds no privilege and needs no migration.
 *
 * AUTHORIZATION IS INHERITED, NEVER WIDENED. Every branch runs as the signed-in
 * user through a path that already existed:
 *   * worker → `list_open_demand_for_workers()` — the existing gated RPC:
 *     worker-only caller gate, `status = 'submitted'`, verified company only,
 *     closed column whitelist. Non-workers get an empty set, not an error.
 *   * employer → their OWN `customer_requests` under `customer_requests_select`
 *     (`profile_id = auth.uid()`), so an employer sees the need they just
 *     created. Admin reads flow through the same policy's `is_admin()` branch.
 * There is no service-role client here and no `security definer` of our own.
 * Organization A cannot reach organization B's private request through this
 * module for the same reason it cannot reach it through the tables.
 *
 * HONEST BY CONSTRUCTION — nothing is invented:
 *   * `quantity` is `null` when the source has no headcount. It is NOT
 *     defaulted to 1. (The previous map read did `headcount_needed ?? 1`,
 *     which turned "we do not know" into "one person".)
 *   * `country` / `cityLabel` are `null` when absent. A row with no country
 *     never receives a centroid and never becomes a marker.
 *   * `actionable` is the honest discriminator required when a person can meet
 *     both kinds: a `customer_request` a worker may act on is `true`; a
 *     historical `job_demand` is `false`, because there is no interest, apply
 *     or booking path behind it. A marker built from a non-actionable row must
 *     not imply that a worker can apply.
 *   * no salary, no fit score, no AI confidence and no company identity is
 *     synthesized here — absent fields stay absent.
 *
 * ERROR IS NOT EMPTY. If a branch the caller was entitled to read fails, the
 * result is `error`. "There is no demand" and "we could not read the demand"
 * are different answers and this module never returns the first for the second.
 */

export type { CanonicalDemand, CanonicalDemandResult };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

/** Worker-visible demand row, exactly the RPC's closed whitelist. */
interface WorkerDemandRow {
  readonly id: string | null;
  readonly role_text: string | null;
  readonly country: string | null;
  readonly team_size: number | null;
  readonly location_label: string | null;
  /** Already in the RPC's closed whitelist, and only for a VERIFIED company. */
  readonly company_name: string | null;
  readonly created_at: string | null;
}

/** The employer's own request — own-rows only, under existing RLS. */
interface OwnRequestRow {
  readonly id: string | null;
  readonly role_or_work_type: string | null;
  readonly country: string | null;
  readonly team_size: number | null;
  readonly location: string | null;
  readonly created_at: string | null;
}

/**
 * Read every demand the CALLER is already entitled to see, as one list.
 *
 * Branch failures are not equal. The legacy read and the employer's own read
 * are ordinary RLS-governed selects: if either errors we could not answer, so
 * the whole result is `error`. The worker RPC is different — it is absent in
 * environments where the owner-gated migration has not been applied, and it
 * raises `42501` for an unauthenticated caller. Those are KNOWN states, not
 * read failures, so they contribute no rows and do not poison the result.
 */
export async function loadCanonicalDemand(): Promise<CanonicalDemandResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { state: "error", errorCode: "not_authenticated" };

  const rows: CanonicalDemand[] = [];

  // NOTE (consolidation slice 1, 2026-08-17): the former leg 1 — a legacy
  // `job_demands` read — was removed. The table has held 0 rows in production
  // for its whole life (measured 2026-08-17) and NOTHING a customer touches
  // writes it, so the leg only ever contributed an empty set. The schema stays
  // frozen (docs/audits/duplication-freeze-register-2026-08-17.md); the
  // `job_demand` source member in canonical-demand-model.ts remains as the
  // historical vocabulary for rows that no longer arrive.

  // ── 1. Worker-visible actionable demand, through the existing gated RPC.
  // An absent RPC (migration not applied) or a non-worker caller yields no
  // rows — both are known states, never an error surface.
  const workerDemand = await asAny(supabase).rpc("list_open_demand_for_workers");
  if (!workerDemand.error) {
    for (const row of (workerDemand.data ?? []) as WorkerDemandRow[]) {
      const mapped = toCanonicalDemand({
        id: row.id,
        source: "customer_request",
        actionable: true,
        country: row.country,
        cityLabel: row.location_label,
        quantity: row.team_size,
        roleText: row.role_text,
        // The RPC already returns this, gated on the company being verified.
        // Reading a column the function was written to expose is not a
        // widening; dropping it on the floor and rendering "not stated" for a
        // name we are allowed to show was the honesty gap this closes.
        organizationName: row.company_name,
        createdAt: row.created_at,
      });
      if (mapped) rows.push(mapped);
    }
  }

  // ── 2. The caller's OWN submitted requests. This is what makes the employer
  // who just created a need see it on the same map everyone else reads. RLS
  // (`profile_id = auth.uid()`) is the only thing granting this; an employer
  // reaches exactly their own rows and no other tenant's.
  //
  // Stage A workspace gate: the EMPLOYER kinds of this leg (company_request /
  // agency_offer) additionally require a resolved company workspace through
  // the ONE canonical resolver — an employer acting in the wrong space must
  // not have their employer demand rendered as if the workspace were real.
  // A caller with no employer context (worker, pure buyer, personal space)
  // keeps the NON-employer rows they own: buyer-spine rows carry a null kind
  // (save_customer_request, 0028, predates the kind column) or the buyer /
  // customer kinds. Fail-closed for employer demand, unchanged for the rest.
  const employer = await requireEmployerCompany();
  let ownQuery = supabase
    .from("customer_requests")
    .select("id, role_or_work_type, country, team_size, location, created_at")
    .eq("status", "submitted");
  if (!employer.ok) {
    ownQuery = ownQuery.or(
      "kind.is.null,kind.eq.buyer_request,kind.eq.customer_request",
    );
  }
  const own = await ownQuery.limit(500);

  if (own.error) return { state: "error", errorCode: "own_demand_read_failed" };

  for (const row of (own.data ?? []) as unknown as OwnRequestRow[]) {
    const mapped = toCanonicalDemand({
      id: row.id,
      source: "customer_request",
      actionable: true,
      country: row.country,
      cityLabel: row.location,
      quantity: row.team_size,
      roleText: row.role_or_work_type,
      // The own-rows select carries no company column, and the row's
      // organisation is NOT the viewer's active workspace — borrowing that name
      // would attach an organisation the row never named. Absent stays absent.
      organizationName: null,
      createdAt: row.created_at,
    });
    if (mapped) rows.push(mapped);
  }

  return { state: "ok", rows };
}
