import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { loadCanonicalDemand } from "@/lib/demand/canonical-demand";
import { listAvailableSupplyForEmployer } from "@/lib/supply/employer-supply-discovery";
import {
  VACANCY_SLICE_JOB_TAB,
  VACANCY_SLICE_MIXED,
  adaptersForDomain,
  demandToRow,
  supplyToRow,
  vacancyToRow,
  type FederationOutcome,
  type FederationSource,
} from "@/lib/marketplace/federation-model";
import type { MarketplaceDiscoveryRow } from "@/lib/marketplace/listings-model";

/**
 * Universal Marketplace — FEDERATION ADAPTERS, the IO half.
 *
 * Composes the readers that are ALREADY authorized for the signed-in caller;
 * it holds no service-role client, defines no SECURITY DEFINER function and
 * copies nothing into `marketplace_listings`. Authority is the database's:
 *
 *   vacancies  `search_public_vacancy_previews_v1` — the anon-boundary
 *              projection (title_raw / attribution_code are NULL for everyone).
 *              Not widened: the same four arguments, the same columns.
 *   workforce  `list_open_supply_for_employers` — a caller who manages no
 *              organization gets zero rows from the function itself.
 *   demand     `list_open_demand_for_workers` (worker gate, verified company
 *              only) + the caller's OWN submitted requests under RLS.
 *
 * A source that FAILS to read is reported in `unavailable` — never rendered as
 * an empty market. Pure mapping lives in `federation-model.ts`.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

async function readVacancies(limit: number): Promise<{
  rows: MarketplaceDiscoveryRow[];
  ok: boolean;
}> {
  const supabase = await createClient();
  const { data, error } = await asAny(supabase).rpc("search_public_vacancy_previews_v1", {
    p_query: null,
    p_profession_slug: null,
    p_limit: limit,
    p_offset: 0,
  });
  if (error) {
    // Code only — never a database message at a person. A statement timeout
    // (57014) or a missing function is "could not read", not "no jobs".
    console.error("[marketplace-federation] vacancy read failed:", error.code);
    return { rows: [], ok: false };
  }
  const rows: MarketplaceDiscoveryRow[] = [];
  for (const raw of (data ?? []) as Record<string, unknown>[]) {
    const row = vacancyToRow(raw);
    if (row) rows.push(row);
  }
  return { rows, ok: true };
}

/**
 * Read the federated domains the filter asks for. Never throws: each adapter is
 * independent, so one failing source cannot blank the others.
 */
export async function readFederatedMarketRows(opts: {
  domain?: string | null;
}): Promise<FederationOutcome> {
  const want = adaptersForDomain(opts.domain);
  const unavailable: FederationSource[] = [];
  const rows: MarketplaceDiscoveryRow[] = [];

  const mixed = !opts.domain || opts.domain === "all";
  const [vac, sup, dem] = await Promise.all([
    want.vacancies
      ? readVacancies(mixed ? VACANCY_SLICE_MIXED : VACANCY_SLICE_JOB_TAB).catch(() => ({
          rows: [] as MarketplaceDiscoveryRow[],
          ok: false,
        }))
      : null,
    want.workforce ? listAvailableSupplyForEmployer({ limit: 50 }).catch(() => null) : null,
    want.demand ? loadCanonicalDemand().catch(() => null) : null,
  ]);

  if (vac) {
    rows.push(...vac.rows);
    if (!vac.ok) unavailable.push("vacancies");
  }
  if (want.workforce) {
    if (sup && sup.kind === "ok") {
      for (const r of sup.rows) {
        const row = supplyToRow(r);
        if (row) rows.push(row);
      }
    } else if (!sup || sup.kind === "needs-migration" || sup.kind === "error") {
      unavailable.push("workforce");
    }
  }
  if (want.demand) {
    if (dem && dem.state === "ok") {
      for (const d of dem.rows) {
        const row = demandToRow(d);
        if (row) rows.push(row);
      }
    } else {
      unavailable.push("demand");
    }
  }
  return { rows, unavailable };
}
