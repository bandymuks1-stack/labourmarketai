"use server";

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  SERVICE_OFFERING_STATUSES,
  type ServiceOfferingInput,
  type ServiceOfferingListResult,
  type ServiceOfferingMutateResult,
  type ServiceOfferingRow,
  type ServiceOfferingStatus,
} from "@/lib/services/service-offerings-shared";

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

  const { data, error } = await asAny(supabase)
    .from("service_offerings")
    .select(
      "id, title, description, category_slug, location_country, remote, rate_text, status, created_at, updated_at",
    )
    .eq("provider_id", user.id)
    .order("created_at", { ascending: false });
  if (error) {
    if (isAbsent(error)) return { kind: "needs-migration" };
    // Any other read failure degrades to an empty list — never a fake row.
    return { kind: "ok", rows: [] };
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
  revalidatePath("/dashboard/services");
  return { kind: "ok", id: data?.id as string | undefined };
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

  const { error } = await asAny(supabase)
    .from("service_offerings")
    .update({ ...v.values, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("provider_id", user.id); // belt-and-suspenders alongside RLS.
  if (error) {
    if (isAbsent(error)) return { kind: "needs-migration" };
    return { kind: "error", message: error.message ?? "unknown" };
  }
  revalidatePath("/dashboard/services");
  return { kind: "ok", id };
}

export async function setServiceOfferingStatus(
  id: string,
  status: ServiceOfferingStatus,
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

  const { error } = await asAny(supabase)
    .from("service_offerings")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("provider_id", user.id);
  if (error) {
    if (isAbsent(error)) return { kind: "needs-migration" };
    return { kind: "error", message: error.message ?? "unknown" };
  }
  revalidatePath("/dashboard/services");
  return { kind: "ok", id };
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

  const { error } = await asAny(supabase)
    .from("service_offerings")
    .delete()
    .eq("id", id)
    .eq("provider_id", user.id);
  if (error) {
    if (isAbsent(error)) return { kind: "needs-migration" };
    return { kind: "error", message: error.message ?? "unknown" };
  }
  revalidatePath("/dashboard/services");
  return { kind: "ok", id };
}
