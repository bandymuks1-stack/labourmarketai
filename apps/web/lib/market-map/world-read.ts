import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireEmployerCompany } from "@/lib/company/employer-company-context";
import {
  dedupeCanonicalDemand,
  placeableDemand,
  toCanonicalDemand,
  type CanonicalDemand,
} from "@/lib/demand/canonical-demand-model";
import { COUNTRY_CENTROID, listKnownCities } from "@/lib/location/city-coordinates";
import { getOwnMarketSignals } from "./signals";
import { buildPersonPresenceLayer } from "./spatial-entities";
import {
  WORLD_ROW_LIMIT,
  buildWorldLayerView,
  countriesForBounds,
  placeWorldRow,
  type PlaceablePoint,
  type WorldLayer,
  type WorldNote,
  type WorldObject,
  type WorldRequest,
  type WorldViewResult,
} from "./world-model";

/**
 * WORLD — the bounded read (P8 discovery subset, stage H2).
 *
 * ONE request = ONE layer for ONE viewport. The viewport is turned into the
 * set of countries that can produce a point inside it (`countriesForBounds`
 * over the known-city table + centroids) and every DB leg filters
 * `country in (...)` on the EXISTING column and stops at `WORLD_ROW_LIMIT`.
 * No new RPC, no new table, no migration; RLS is the authorization on every
 * leg exactly as on the surfaces these rows already appear on.
 *
 * THE QUERY SHAPES (evidence for the PR, kept next to the code):
 *
 *   demand  · rpc list_open_demand_for_workers()            — the existing
 *             gated privileged RPC, LIMIT 100 inside the function, worker
 *             caller only; it takes NO viewport, so its rows are filtered on
 *             `country` here (note `worker_demand_filtered_after_read`; the
 *             bbox RPC is the contract's §9 gap, not this slice).
 *           · customer_requests  select id, role_or_work_type, country,
 *             team_size, location, created_at
 *             where status = 'submitted' and country in ($countries)
 *             [and kind is null / buyer_request / customer_request — when the
 *             caller has no employer workspace, the Stage-A gate verbatim]
 *             order by created_at desc limit WORLD_ROW_LIMIT + 1
 *             — RLS `profile_id = auth.uid()` → index
 *             customer_requests_profile_idx (profile_id, created_at desc)
 *             bounds the scan to the caller's rows in creation order.
 *   projects· projects select id, title, country, city, status
 *             where country in ($countries)
 *             order by created_at desc limit WORLD_ROW_LIMIT + 1
 *             — RLS owns_company / active relationship / admin; tenant-bounded.
 *   supply  · getOwnMarketSignals() — the six existing own-row reads, then
 *             buildPersonPresenceLayer (§20: n<3 dropped, n<5 withheld).
 *
 * WHY NOT `loadCanonicalDemand()` ITSELF. Its zero-argument signature is pinned
 * by `lib/guards/canonical-demand-truth.test.ts` and the worker RPC takes no
 * parameters, so a viewport cannot be threaded through it without weakening a
 * guard. This read runs the SAME two legs under the SAME authorization and
 * pushes every row through the SAME pure model (`toCanonicalDemand` →
 * `dedupeCanonicalDemand` → `placeableDemand`); only the predicate differs.
 * One demand truth, two predicates — never two normalisations.
 *
 * HONEST BY CONSTRUCTION. A failed leg is `error`, never an empty map. A row
 * whose place is unknown is folded onto its country centroid as DERIVED, one
 * whose country is unknown is COUNTED as unplaced. A people bucket under five
 * is COUNTED as withheld. A leg that hit its limit says `truncated`, and the
 * client prints "counts are a lower bound". Nothing is defaulted into a number.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

interface LayerRead {
  readonly objects: WorldObject[];
  readonly unplaced: number;
  readonly withheld: number;
  readonly truncated: boolean;
  readonly notes: WorldNote[];
  readonly error: string | null;
}

function emptyRead(): { objects: WorldObject[]; unplaced: number; withheld: number; truncated: boolean; notes: WorldNote[]; error: string | null } {
  return { objects: [], unplaced: 0, withheld: 0, truncated: false, notes: [], error: null };
}

/** Every point the controlled geography can place — cities + centroids. */
function placeablePoints(): PlaceablePoint[] {
  const out: PlaceablePoint[] = listKnownCities().map((c) => ({
    country: c.country,
    lat: c.coord.lat,
    lng: c.coord.lng,
  }));
  for (const [country, c] of Object.entries(COUNTRY_CENTROID)) {
    out.push({ country, lat: c.lat, lng: c.lng });
  }
  return out;
}

export async function loadWorldView(request: WorldRequest): Promise<WorldViewResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not_authenticated" };

  const countries = countriesForBounds(request.bounds, placeablePoints());

  // Nothing placeable lies in this viewport (open sea, poles): no query at
  // all — the honest answer costs the database nothing.
  if (countries.length === 0) {
    return {
      kind: "ok",
      view: buildWorldLayerView({ ...request, countries, objects: [] }),
    };
  }

  const read = await readLayer(supabase, request.layer, countries);
  return {
    kind: "ok",
    view: buildWorldLayerView({
      layer: request.layer,
      bounds: request.bounds,
      zoom: request.zoom,
      countries,
      objects: read.objects,
      unplaced: read.unplaced,
      withheld: read.withheld,
      truncated: read.truncated,
      notes: read.notes,
      error: read.error,
    }),
  };
}

async function readLayer(
  supabase: SupabaseClient,
  layer: WorldLayer,
  countries: readonly string[],
): Promise<LayerRead> {
  switch (layer) {
    case "demand":
      return readDemand(supabase, countries);
    case "projects":
      return readProjects(supabase, countries);
    case "supply":
      return readSupply();
  }
}

// ── demand ──────────────────────────────────────────────────────────────────

interface WorkerDemandRow {
  readonly id: string | null;
  readonly role_text: string | null;
  readonly country: string | null;
  readonly team_size: number | null;
  readonly location_label: string | null;
  readonly created_at: string | null;
}

interface OwnRequestRow {
  readonly id: string | null;
  readonly role_or_work_type: string | null;
  readonly country: string | null;
  readonly team_size: number | null;
  readonly location: string | null;
  readonly created_at: string | null;
}

async function readDemand(
  supabase: SupabaseClient,
  countries: readonly string[],
): Promise<LayerRead> {
  const out = emptyRead();
  const wanted = new Set(countries);
  const rows: CanonicalDemand[] = [];

  // Leg 1 — worker-visible demand through the EXISTING gated RPC. Absent RPC
  // or non-worker caller → no rows (known states, not errors). It has no
  // viewport parameter, so its ≤100 rows are filtered on country here.
  const workerDemand = await asAny(supabase).rpc("list_open_demand_for_workers");
  if (!workerDemand.error) {
    out.notes.push("worker_demand_filtered_after_read");
    for (const row of (workerDemand.data ?? []) as WorkerDemandRow[]) {
      const code = row.country?.trim().toUpperCase() ?? "";
      if (!wanted.has(code)) continue;
      const mapped = toCanonicalDemand({
        id: row.id,
        source: "customer_request",
        actionable: true,
        country: row.country,
        cityLabel: row.location_label,
        quantity: row.team_size,
        roleText: row.role_text,
        createdAt: row.created_at,
      });
      if (mapped) rows.push(mapped);
    }
  }

  // Leg 2 — the caller's OWN submitted requests, bounded by the viewport's
  // countries and by WORLD_ROW_LIMIT. Same Stage-A workspace gate as the
  // canonical read: no employer workspace → only the non-employer kinds.
  const employer = await requireEmployerCompany();
  let ownQuery = supabase
    .from("customer_requests")
    .select("id, role_or_work_type, country, team_size, location, created_at")
    .eq("status", "submitted")
    .in("country", [...countries]);
  if (!employer.ok) {
    ownQuery = ownQuery.or("kind.is.null,kind.eq.buyer_request,kind.eq.customer_request");
  }
  const own = await ownQuery
    .order("created_at", { ascending: false })
    .limit(WORLD_ROW_LIMIT + 1);
  if (own.error) return { ...out, error: "own_demand_read_failed" };

  const ownRows = (own.data ?? []) as unknown as OwnRequestRow[];
  if (ownRows.length > WORLD_ROW_LIMIT) out.truncated = true;
  for (const row of ownRows.slice(0, WORLD_ROW_LIMIT)) {
    const mapped = toCanonicalDemand({
      id: row.id,
      source: "customer_request",
      actionable: true,
      country: row.country,
      cityLabel: row.location,
      quantity: row.team_size,
      roleText: row.role_or_work_type,
      createdAt: row.created_at,
    });
    if (mapped) rows.push(mapped);
  }

  // Dedup first (one canonical demand = one unit), then place. The weight is
  // demand INTENSITY, not a headcount claim: an unknown team size counts 1 —
  // "at least one need exists here" — the same floor market-result.ts uses,
  // and the list shows the role, never an invented number of people.
  for (const row of placeableDemand(dedupeCanonicalDemand(rows))) {
    const placed = placeWorldRow(row.country, row.cityLabel);
    if (!placed) {
      out.unplaced += 1;
      continue;
    }
    out.objects.push({
      id: row.key,
      layer: "demand",
      label: row.roleText ?? placed.placeLabel,
      placeLabel: placed.placeLabel,
      country: row.country as string,
      lat: placed.lat,
      lng: placed.lng,
      precision: placed.precision,
      provenance: placed.provenance,
      weight: row.quantity ?? 1,
    });
  }
  return out;
}

// ── projects ────────────────────────────────────────────────────────────────

interface ProjectRow {
  readonly id: string;
  readonly title: string | null;
  readonly country: string | null;
  readonly city: string | null;
  readonly status: string | null;
}

async function readProjects(
  supabase: SupabaseClient,
  countries: readonly string[],
): Promise<LayerRead> {
  const out = emptyRead();
  const res = await asAny(supabase)
    .from("projects")
    .select("id, title, country, city, status")
    .in("country", [...countries])
    .order("created_at", { ascending: false })
    .limit(WORLD_ROW_LIMIT + 1);
  if (res.error) return { ...out, error: "projects_read_failed" };

  const rows = (res.data ?? []) as ProjectRow[];
  if (rows.length > WORLD_ROW_LIMIT) out.truncated = true;
  for (const p of rows.slice(0, WORLD_ROW_LIMIT)) {
    const placed = placeWorldRow(p.country, p.city);
    if (!placed) {
      out.unplaced += 1;
      continue;
    }
    out.objects.push({
      id: `project:${p.id}`,
      layer: "projects",
      label: p.title?.trim() || placed.placeLabel,
      placeLabel: placed.placeLabel,
      country: (p.country as string).trim().toUpperCase(),
      lat: placed.lat,
      lng: placed.lng,
      precision: placed.precision,
      provenance: placed.provenance,
      weight: 1,
    });
  }
  return out;
}

// ── supply (people, aggregate-only) ─────────────────────────────────────────

async function readSupply(): Promise<LayerRead> {
  const out = emptyRead();
  out.notes.push("aggregate_only");
  const signals = await getOwnMarketSignals();
  if (signals === null) return { ...out, error: "signals_read_failed" };

  for (const bucket of buildPersonPresenceLayer(signals)) {
    // A small-sample bucket carries no count by design (§20). Drawing it
    // would need a number we deliberately do not have — counted as withheld.
    if (bucket.band.kind !== "exact") {
      out.withheld += 1;
      continue;
    }
    const placed = placeWorldRow(bucket.country, bucket.city ?? bucket.region);
    if (!placed) {
      out.unplaced += 1;
      continue;
    }
    out.objects.push({
      id: `people:${bucket.areaKey}`,
      layer: "supply",
      label: placed.placeLabel,
      placeLabel: placed.placeLabel,
      country: bucket.country,
      lat: placed.lat,
      lng: placed.lng,
      precision: placed.precision,
      // An aggregate is always derived — a bucket is a count, not a record.
      provenance: "derived",
      weight: bucket.band.count,
    });
  }
  return out;
}
