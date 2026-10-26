"use server";

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { emitServerFunnelEvent } from "@/lib/telemetry/server-funnel";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import {
  SERVICE_OFFERING_STATUSES,
  type ServiceOfferingInput,
  type ServiceOfferingListResult,
  type ServiceOfferingMutateResult,
  type ServiceOfferingRow,
  type ServiceOfferingStatus,
} from "@/lib/services/service-offerings-shared";
import { actionForStatus, serviceAdapter } from "@/lib/market-lifecycle/adapters";
import { transition, type EntryAction } from "@/lib/market-lifecycle/contract";

/**
 * Service offerings (W8 — services real model, Phase 1) — provider-owned supply
 * listings. The SUPPLY mirror of the demand model (customer_requests).
 *
 * Owner-scoped: every read/write goes through the caller's RLS-scoped client and
 * pins provider_id = auth.uid(), so a user can only ever see/manage their OWN
 * rows. No SECURITY DEFINER, no privileged key, no cross-user read, no payment.
 *
 * HONEST DEGRADATION: the migration is owner-applied (RED). Until it is applied,
 * the table is absent — every function returns `needs-migration` and the UI
 * shows a calm "not available yet" state, never an error and never fake rows.
 */

// PostgREST: table absent → 42P01 (undefined_table) / PGRST205 (not in schema
// cache); 42883 / PGRST202 cover an absent function (none here, but kept for
// parity with the booking actions classifier).
const ABSENT = new Set(["42P01", "42883", "PGRST202", "PGRST204", "PGRST205"]);

const MAX_TITLE = 120;
const MAX_DESC = 2000;
const MAX_CATEGORY = 80;
const MAX_RATE = 120;
const COUNTRY_RE = /^[A-Z]{2}$/;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

function clean(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

function isAbsent(error: { code?: string } | null): boolean {
  return !!error?.code && ABSENT.has(error.code);
}

/** `closed_outcome` not there yet: the lifecycle migration is unapplied. */
function isMissingColumn(error: { code?: string } | null): boolean {
  return error?.code === "42703";
}

const OWN_COLUMNS =
  "id, title, description, category_slug, location_country, remote, rate_text, status, created_at, updated_at";

/**
 * The caller's own offering as the lifecycle contract reads it. `closedSupported`
 * is false while the closed-outcome migration is unapplied: the contract then
 * offers no complete / withdraw, and nothing pretends a service can close.
 */
async function readOwnLifecycle(
  supabase: SupabaseClient,
  id: string,
  userId: string,
): Promise<
  | { kind: "ok"; status: string; closedOutcome: string | null; closedSupported: boolean }
  | { kind: "not-found" }
  | { kind: "error"; message: string; absent: boolean }
> {
  let closedSupported = true;
  let res = await asAny(supabase)
    .from("service_offerings")
    .select("status, closed_outcome")
    .eq("id", id)
    .eq("provider_id", userId)
    .maybeSingle();
  if (res.error && isMissingColumn(res.error)) {
    closedSupported = false;
    res = await asAny(supabase)
      .from("service_offerings")
      .select("status")
      .eq("id", id)
      .eq("provider_id", userId)
      .maybeSingle();
  }
  if (res.error) return { kind: "error", message: res.error.message ?? "unknown", absent: isAbsent(res.error) };
  if (!res.data) return { kind: "not-found" };
  return {
    kind: "ok",
    status: String(res.data.status),
    closedOutcome: (res.data.closed_outcome as string | null | undefined) ?? null,
    closedSupported,
  };
}

/** Validate shared input. Returns the cleaned column values or an invalid tag. */
function validate(
  input: ServiceOfferingInput,
):
  | {
      ok: true;
      values: {
        title: string;
        description: string | null;
        category_slug: string | null;
        location_country: string | null;
        remote: boolean;
        rate_text: string | null;
      };
    }
  | { ok: false; field: string } {
  const title = clean(input.title, MAX_TITLE);
  if (!title) return { ok: false, field: "title" };
  const country = clean(input.locationCountry, 2)?.toUpperCase() ?? null;
  if (country !== null && !COUNTRY_RE.test(country)) {
    return { ok: false, field: "locationCountry" };
  }
  return {
    ok: true,
    values: {
      title,
      description: clean(input.description, MAX_DESC),
      category_slug: clean(input.categorySlug, MAX_CATEGORY),
      location_country: country,
      remote: input.remote === true,
      rate_text: clean(input.rateText, MAX_RATE),
    },
  };
}

/** The caller's OWN service offerings (RLS-scoped). Newest first. */
export async function listOwnServiceOfferings(): Promise<ServiceOfferingListResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  let closedSupported = true;
  let { data, error } = await asAny(supabase)
    .from("service_offerings")
    .select(`${OWN_COLUMNS}, closed_outcome`)
    .eq("provider_id", user.id)
    .order("created_at", { ascending: false });
  if (error && isMissingColumn(error)) {
    closedSupported = false;
    ({ data, error } = await asAny(supabase)
      .from("service_offerings")
      .select(OWN_COLUMNS)
      .eq("provider_id", user.id)
      .order("created_at", { ascending: false }));
  }
  if (error) {
    if (isAbsent(error)) return { kind: "needs-migration" };
    // Any other read failure is UNAVAILABLE — never an empty list that reads
    // as "you have no offerings" (SEP-7, audit 2026-10-16).
    return { kind: "unavailable" };
  }
  const rows: ServiceOfferingRow[] = (
    (data ?? []) as Record<string, unknown>[]
  ).map((r) => ({
    id: String(r.id),
    title: String(r.title ?? ""),
    description: (r.description as string | null) ?? null,
    categorySlug: (r.category_slug as string | null) ?? null,
    locationCountry: (r.location_country as string | null) ?? null,
    remote: r.remote === true,
    rateText: (r.rate_text as string | null) ?? null,
    status: (r.status as ServiceOfferingStatus) ?? "draft",
    closedOutcome: (r.closed_outcome as string | null | undefined) ?? null,
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
  }));
  return { kind: "ok", rows, closedSupported };
}

/**
 * ANOTHER PROVIDER'S ACTIVE OFFERINGS — what this person can concretely do.
 *
 * The person page could name a profession and list skills, and could not say
 * what work the person actually offers to do. These rows already existed and
 * were rendered on the provider's own surfaces and on the ORGANIZATION public
 * page; a person's own were never shown on a person's own page.
 *
 * PERMISSION IS THE DATABASE'S. `service_offerings` carries a
 * `status = 'active'` discovery policy alongside the owner policy, so an
 * active offering is already discoverable and a draft or paused one is not.
 * This adds no policy and no grant: the `status` filter below matches the
 * policy rather than widening past it, so a draft cannot leak even if this
 * filter were removed.
 *
 * A failed read is `unavailable`, never an empty list — "this person offers
 * nothing" is a claim, and a broken query has not earned it.
 */
export type ProviderOfferingsRead =
  | { readonly kind: "ok"; readonly rows: readonly ServiceOfferingRow[] }
  | { readonly kind: "unavailable" };

export async function listActiveOfferingsByProvider(
  providerId: string,
  limit = 6,
): Promise<ProviderOfferingsRead> {
  if (!providerId) return { kind: "ok", rows: [] };
  const supabase = await createClient();
  const { data, error } = await asAny(supabase)
    .from("service_offerings")
    .select(
      "id, title, description, category_slug, location_country, remote, rate_text, status, created_at, updated_at",
    )
    .eq("provider_id", providerId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    // The table not existing yet is an ENVIRONMENT fact, not a person fact:
    // report nothing rather than an alarming failure on someone's profile.
    if (isAbsent(error)) return { kind: "ok", rows: [] };
    return { kind: "unavailable" };
  }
  const rows: ServiceOfferingRow[] = (
    (data ?? []) as Record<string, unknown>[]
  ).map((r) => ({
    id: String(r.id),
    title: String(r.title ?? ""),
    description: (r.description as string | null) ?? null,
    categorySlug: (r.category_slug as string | null) ?? null,
    locationCountry: (r.location_country as string | null) ?? null,
    remote: r.remote === true,
    rateText: (r.rate_text as string | null) ?? null,
    status: (r.status as ServiceOfferingStatus) ?? "draft",
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
  }));
  return { kind: "ok", rows };
}

export async function createServiceOffering(
  input: ServiceOfferingInput,
): Promise<ServiceOfferingMutateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  const v = validate(input);
  if (!v.ok) return { kind: "invalid", field: v.field };

  const { data, error } = await asAny(supabase)
    .from("service_offerings")
    // provider_id pinned to the caller; RLS with-check enforces it server-side.
    .insert({ provider_id: user.id, status: "draft", ...v.values })
    .select("id")
    .single();
  if (error) {
    if (isAbsent(error)) return { kind: "needs-migration" };
    return { kind: "error", message: error.message ?? "unknown" };
  }
  revalidatePath("/[locale]/dashboard/services", "page");
  return { kind: "ok", id: data?.id as string | undefined };
}

/**
 * A write filtered to the caller's own row that matched NO row changed
 * nothing — someone else's offering, or one already gone. RLS keeps the row
 * safe either way; this keeps the ANSWER honest, so neither the web nor an
 * assistant is told "done" about a change nobody made (prod MCP walk
 * 2026-10-13: a stranger's delete confirm answered ok while the row stayed).
 */
function touchedAny(rows: unknown): boolean {
  return Array.isArray(rows) && rows.length > 0;
}

export async function updateServiceOffering(
  id: string,
  input: ServiceOfferingInput,
): Promise<ServiceOfferingMutateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };
  if (!id) return { kind: "invalid", field: "id" };

  const v = validate(input);
  if (!v.ok) return { kind: "invalid", field: v.field };

  const { data: touched, error } = await asAny(supabase)
    .from("service_offerings")
    .update({ ...v.values, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("provider_id", user.id) // belt-and-suspenders alongside RLS.
    .select("id");
  if (error) {
    if (isAbsent(error)) return { kind: "needs-migration" };
    return { kind: "error", message: error.message ?? "unknown" };
  }
  if (!touchedAny(touched)) return { kind: "not-found" };
  revalidatePath("/[locale]/dashboard/services", "page");
  return { kind: "ok", id };
}

/**
 * Move an offering through the ONE lifecycle contract
 * (`lib/market-lifecycle/contract.ts`): publish, pause, resume, complete,
 * withdraw. The contract decides whether the action applies to the row's
 * current state; a forbidden move changes nothing (`invalid`).
 */
export async function applyServiceOfferingAction(
  id: string,
  action: EntryAction,
): Promise<ServiceOfferingMutateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };
  if (!id) return { kind: "invalid", field: "id" };

  const current = await readOwnLifecycle(supabase, id, user.id);
  if (current.kind === "not-found") return { kind: "not-found" };
  if (current.kind === "error") {
    return current.absent ? { kind: "needs-migration" } : { kind: "error", message: current.message };
  }
  const adapter = serviceAdapter({ closedSupported: current.closedSupported });
  const target = action === "edit" ? null : transition(adapter.support, adapter.facts(current), action);
  if (!target) return { kind: "invalid", field: "action" };

  const patch: Record<string, unknown> = {
    status: adapter.statusFor(target.state),
    updated_at: new Date().toISOString(),
  };
  if (current.closedSupported) patch.closed_outcome = target.closedOutcome;
  // `.eq("status", current)`: a concurrent change wins; this one touches nothing.
  const { data: touched, error } = await asAny(supabase)
    .from("service_offerings")
    .update(patch)
    .eq("id", id)
    .eq("provider_id", user.id)
    .eq("status", current.status)
    .select("id");
  if (error) {
    if (isAbsent(error)) return { kind: "needs-migration" };
    return { kind: "error", message: error.message ?? "unknown" };
  }
  if (!touchedAny(touched)) return { kind: "not-found" };
  // Funnel "offer side": only the FIRST publication (draft -> active) counts.
  if (action === "publish") {
    emitServerFunnelEvent(FUNNEL_EVENTS.offerCreated, {
      source: "services",
      metadata: { surface: "service_offering", entity_type: "service_offering" },
    });
  }
  revalidatePath("/[locale]/dashboard/services", "page");
  return { kind: "ok", id };
}

/**
 * The status-shaped door older callers and the MCP `status_set` tool use. It
 * is translated into the contract action that produces `status` from the
 * row's current state, never written raw, so every door obeys the same
 * transitions.
 */
export async function setServiceOfferingStatus(
  id: string,
  status: ServiceOfferingStatus,
  closedOutcome: "completed" | "withdrawn" = "completed",
): Promise<ServiceOfferingMutateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };
  if (!id) return { kind: "invalid", field: "id" };
  if (!SERVICE_OFFERING_STATUSES.includes(status)) {
    return { kind: "invalid", field: "status" };
  }
  const current = await readOwnLifecycle(supabase, id, user.id);
  if (current.kind === "not-found") return { kind: "not-found" };
  if (current.kind === "error") {
    return current.absent ? { kind: "needs-migration" } : { kind: "error", message: current.message };
  }
  if (current.status === status) return { kind: "ok", id };
  const adapter = serviceAdapter({ closedSupported: current.closedSupported });
  const action = actionForStatus(adapter, adapter.facts(current), status, closedOutcome);
  if (!action) return { kind: "invalid", field: "status" };
  return applyServiceOfferingAction(id, action);
}

export async function deleteServiceOffering(
  id: string,
): Promise<ServiceOfferingMutateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };
  if (!id) return { kind: "invalid", field: "id" };

  // AN OFFERING WITH REQUESTS IS HISTORY, NOT A DRAFT (audit 2026-10-20):
  // the request rows cascade on delete, so removing the offering erased every
  // buyer's request on it — accepted ones included — and left their threads
  // and experience records pointing at nothing. Such an offering is paused,
  // never deleted. A count that cannot be read refuses (fail closed).
  const { count, error: countError } = await asAny(supabase)
    .from("service_offering_requests")
    .select("id", { count: "exact", head: true })
    .eq("offering_id", id);
  if (countError) {
    if (isAbsent(countError)) return { kind: "needs-migration" };
    return { kind: "error", message: countError.message ?? "unknown" };
  }
  if ((count ?? 0) > 0) return { kind: "has-requests" };

  const { data: touched, error } = await asAny(supabase)
    .from("service_offerings")
    .delete()
    .eq("id", id)
    .eq("provider_id", user.id)
    .select("id");
  if (error) {
    if (isAbsent(error)) return { kind: "needs-migration" };
    return { kind: "error", message: error.message ?? "unknown" };
  }
  if (!touchedAny(touched)) return { kind: "not-found" };
  revalidatePath("/[locale]/dashboard/services", "page");
  return { kind: "ok", id };
}
