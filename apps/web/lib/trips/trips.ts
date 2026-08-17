import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  TRIP_READ_LIMIT,
  isTripMigrationMissingCode,
  isValidTripStatus,
  type TripRow,
} from "@/lib/trips/trips-model";
import {
  listTripLinkedFinanceRecords,
  type TripLinkedFinance,
} from "@/lib/finance/finance";

/**
 * Business-trip read service (functional completion train V2). Reads ONLY
 * with the caller's RLS-scoped client:
 *   - `business_trips` RLS: the traveler themselves, the org's managers
 *     (BOTH membership truths via manages_organization), or platform admin;
 *   - linked finance rows through the ONE finance read module (its RLS
 *     decides what the caller sees; the trip total honestly covers exactly
 *     those rows).
 *
 * SELF-HEALING STATUS, NEVER SELF-DECIDING: when a SUBMITTED trip's engine
 * instance is already terminal, the read calls the gated
 * `sync_business_trip_decision_v1` RPC — which only COPIES the engine
 * outcome — and re-reads. No decision is ever made here.
 *
 * INTERNAL ONLY: no booking API, no email, no outbound call of any kind.
 *
 * Honest degradation: while the human-gated trips migration is not applied
 * the reads see 42P01 and report { status: "needs-migration" }.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

const TRIP_COLUMNS =
  "id, organization_id, profile_id, destination, date_from, date_to, purpose, project_id, status, advance_amount_cents, submitted_at, decided_at, created_at";

type RawRow = Record<string, unknown>;

function toCentsOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const cents = typeof v === "number" ? v : Number.parseInt(String(v), 10);
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
}

function toTrip(r: RawRow): TripRow | null {
  const status = String(r.status ?? "");
  if (!isValidTripStatus(status)) return null;
  return {
    id: String(r.id),
    organizationId: String(r.organization_id),
    profileId: String(r.profile_id),
    destination: String(r.destination ?? ""),
    dateFrom: String(r.date_from ?? "").slice(0, 10),
    dateTo: String(r.date_to ?? "").slice(0, 10),
    purpose: String(r.purpose ?? ""),
    projectId: (r.project_id as string | null) ?? null,
    status,
    advanceAmountCents: toCentsOrNull(r.advance_amount_cents),
    submittedAt: (r.submitted_at as string | null) ?? null,
    decidedAt: (r.decided_at as string | null) ?? null,
    createdAt: String(r.created_at),
  };
}

export type TripOrgOption = {
  readonly organizationId: string;
  readonly name: string | null;
};

/** Per-org business-trip approval template state (the honest-degradation
 *  seam: submit is only offered where a PUBLISHED template exists). */
export type TripTemplateState = {
  readonly definitionId: string | null;
  readonly published: boolean;
};

export type TripsOverviewResult =
  | { readonly status: "not-authed" }
  | { readonly status: "needs-migration" }
  | {
      readonly status: "ok";
      /** The caller's OWN trips, newest first. */
      readonly mine: readonly TripRow[];
      /** Trips of people in orgs the caller manages (RLS grants the read;
       *  own rows are excluded — presentation split only). */
      readonly org: readonly TripRow[];
      /** Linked finance rows + derived cent-exact totals per trip id. */
      readonly finance: ReadonlyMap<string, TripLinkedFinance>;
      /** Business-trip approval template state per organization id. */
      readonly templates: ReadonlyMap<string, TripTemplateState>;
      /** Organizations the caller could file a trip for. */
      readonly orgOptions: readonly TripOrgOption[];
      readonly error: string | null;
    };

/** Organizations the caller belongs to over EITHER membership truth. */
async function readOrgOptions(
  supabase: SupabaseClient,
  userId: string,
): Promise<TripOrgOption[]> {
  const [ecRes, cmRes] = await Promise.all([
    asAny(supabase)
      .from("engagement_contexts")
      .select("organization_id, organizations(display_name, legal_name)")
      .eq("profile_id", userId)
      .eq("status", "active")
      .limit(TRIP_READ_LIMIT),
    asAny(supabase)
      .from("company_memberships")
      .select("organization_id, organizations(display_name, legal_name)")
      .eq("profile_id", userId)
      .eq("status", "active")
      .limit(TRIP_READ_LIMIT),
  ]);
  type OrgJoin = {
    organization_id: string | null;
    organizations: {
      display_name: string | null;
      legal_name: string | null;
    } | null;
  };
  const options = new Map<string, TripOrgOption>();
  for (const row of [
    ...((ecRes.error ? [] : (ecRes.data ?? [])) as OrgJoin[]),
    ...((cmRes.error ? [] : (cmRes.data ?? [])) as OrgJoin[]),
  ]) {
    if (!row.organization_id) continue;
    if (options.has(row.organization_id)) continue;
    options.set(row.organization_id, {
      organizationId: row.organization_id,
      name:
        row.organizations?.display_name?.trim() ||
        row.organizations?.legal_name?.trim() ||
        null,
    });
  }
  return [...options.values()];
}

/** Business-trip approval templates visible to the caller, keyed by org. */
async function readTemplateStates(
  supabase: SupabaseClient,
): Promise<Map<string, TripTemplateState>> {
  const out = new Map<string, TripTemplateState>();
  const defRes = await asAny(supabase)
    .from("workflow_definitions")
    .select("id, organization_id, is_active, context_entity_type, created_at")
    .eq("context_entity_type", "business_trip")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(TRIP_READ_LIMIT);
  if (defRes.error) return out;
  type DefRow = { id: string; organization_id: string };
  const defs = (defRes.data ?? []) as DefRow[];
  if (defs.length === 0) return out;
  const verRes = await asAny(supabase)
    .from("workflow_definition_versions")
    .select("definition_id, published_at")
    .in(
      "definition_id",
      defs.map((d) => d.id),
    )
    .limit(TRIP_READ_LIMIT * 3);
  const publishedDefs = new Set<string>();
  if (!verRes.error) {
    for (const v of (verRes.data ?? []) as RawRow[]) {
      if (v.published_at !== null && v.published_at !== undefined) {
        publishedDefs.add(String(v.definition_id));
      }
    }
  }
  for (const d of defs) {
    if (out.has(d.organization_id)) continue;
    out.set(d.organization_id, {
      definitionId: d.id,
      published: publishedDefs.has(d.id),
    });
  }
  return out;
}

/**
 * One bounded, RLS-scoped pass building everything the trips section
 * renders. Never throws; never fabricates.
 */
export async function getTripsOverview(): Promise<TripsOverviewResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not-authed" };

  const listRes = await asAny(supabase)
    .from("business_trips")
    .select(TRIP_COLUMNS)
    .order("date_from", { ascending: false })
    .limit(TRIP_READ_LIMIT);
  if (listRes.error) {
    if (isTripMigrationMissingCode(listRes.error.code)) {
      return { status: "needs-migration" };
    }
    return {
      status: "ok",
      mine: [],
      org: [],
      finance: new Map(),
      templates: new Map(),
      orgOptions: [],
      error: String(listRes.error.message ?? "read failed"),
    };
  }

  let trips = ((listRes.data ?? []) as RawRow[])
    .map(toTrip)
    .filter((t): t is TripRow => t !== null);

  // SELF-HEALING: a SUBMITTED trip whose engine instance is terminal is
  // synced through the gated RPC (which only copies the engine outcome)
  // and re-read. Bounded; failures degrade silently.
  const submittedIds = trips
    .filter((t) => t.status === "submitted")
    .map((t) => t.id);
  if (submittedIds.length > 0) {
    const wfRes = await asAny(supabase)
      .from("workflow_instances")
      .select("context_entity_id, status")
      .eq("context_entity_type", "business_trip")
      .in("context_entity_id", submittedIds)
      .order("created_at", { ascending: true })
      .limit(TRIP_READ_LIMIT * 2);
    if (!wfRes.error) {
      const terminal = new Set<string>();
      for (const w of (wfRes.data ?? []) as RawRow[]) {
        const id = String(w.context_entity_id);
        if (String(w.status) === "pending") terminal.delete(id);
        else terminal.add(id);
      }
      if (terminal.size > 0) {
        await Promise.all(
          [...terminal].map((id) =>
            asAny(supabase)
              .rpc("sync_business_trip_decision_v1", { p_trip_id: id })
              .then(() => undefined)
              .catch(() => undefined),
          ),
        );
        const reRes = await asAny(supabase)
          .from("business_trips")
          .select(TRIP_COLUMNS)
          .in("id", [...terminal])
          .limit(TRIP_READ_LIMIT);
        if (!reRes.error) {
          const refreshed = new Map(
            ((reRes.data ?? []) as RawRow[])
              .map(toTrip)
              .filter((t): t is TripRow => t !== null)
              .map((t) => [t.id, t] as const),
          );
          trips = trips.map((t) => refreshed.get(t.id) ?? t);
        }
      }
    }
  }

  const mine = trips.filter((t) => t.profileId === user.id);
  const org = trips.filter((t) => t.profileId !== user.id);

  // Linked expenses + derived totals (through the ONE finance read module).
  const financeRes = await listTripLinkedFinanceRecords(trips.map((t) => t.id));
  const finance =
    financeRes.status === "ok" ? financeRes.byTrip : new Map();

  const [templates, orgOptions] = await Promise.all([
    readTemplateStates(supabase),
    readOrgOptions(supabase, user.id),
  ]);

  return {
    status: "ok",
    mine,
    org,
    finance,
    templates,
    orgOptions,
    error: null,
  };
}
