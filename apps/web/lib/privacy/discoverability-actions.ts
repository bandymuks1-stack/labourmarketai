"use server";

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  CONSENT_LOCALES,
  PROFILE_DISCOVERABILITY_V1,
  consentTextHash,
  type ConsentLocale,
} from "@/lib/privacy/consent-definitions";

/**
 * Profile-discoverability consent — server actions.
 *
 * Rules enforced here + in the SECURITY DEFINER RPCs
 * (20260711130000_privacy_consent_and_disclosure_v1.sql):
 * - the acting user is ALWAYS auth.uid() — no user id parameter exists;
 * - the grant carries the registry's CURRENT version + hash; the RPC
 *   rejects stale versions (fail closed);
 * - default state is NOT granted; declining performs NO server write;
 * - withdrawal is always accepted and takes effect immediately (the RLS
 *   predicate reads the newest ledger row);
 * - HONEST DEGRADATION: before the migration is applied the RPCs are
 *   absent — return kind:"needs-migration", never a fake success.
 */

const ABSENT = new Set(["42883", "42P01", "PGRST202", "PGRST204"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

function toConsentLocale(locale: string): ConsentLocale {
  return (CONSENT_LOCALES as readonly string[]).includes(locale)
    ? (locale as ConsentLocale)
    : "lt";
}

export type DiscoverabilityStatus =
  | "granted"
  | "withdrawn"
  | "granted_stale_version"
  | "not_set";

export interface DiscoverabilityState {
  kind: "ok" | "needs-migration" | "not-authed" | "error";
  status: DiscoverabilityStatus;
  decidedAt: string | null;
  version: string | null;
}

export async function getMyDiscoverabilityState(): Promise<DiscoverabilityState> {
  const empty = (kind: DiscoverabilityState["kind"]): DiscoverabilityState => ({
    kind,
    status: "not_set",
    decidedAt: null,
    version: null,
  });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return empty("not-authed");

  const { data, error } = await asAny(supabase).rpc(
    "current_profile_discoverability_consent",
  );
  if (error) {
    if (error.code && ABSENT.has(error.code)) return empty("needs-migration");
    return empty("error");
  }
  const status = (data?.status ?? "not_set") as DiscoverabilityStatus;
  return {
    kind: "ok",
    status,
    decidedAt: typeof data?.decidedAt === "string" ? data.decidedAt : null,
    version: typeof data?.version === "string" ? data.version : null,
  };
}

export type ConsentActionResult =
  | { kind: "ok" }
  | { kind: "needs-migration" }
  | { kind: "not-authed" }
  | { kind: "stale-version" }
  | { kind: "error" };

export async function grantProfileDiscoverability(input: {
  locale: string;
}): Promise<ConsentActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  const def = PROFILE_DISCOVERABILITY_V1;
  const { data, error } = await asAny(supabase).rpc(
    "grant_profile_discoverability_consent",
    {
      p_version: def.version,
      p_hash: consentTextHash(def),
      p_locale: toConsentLocale(input.locale),
      p_source: "dashboard_privacy_screen",
    },
  );
  if (error) {
    if (error.code && ABSENT.has(error.code)) return { kind: "needs-migration" };
    return { kind: "error" };
  }
  if (!data?.ok) {
    if (data?.error === "stale_consent_version") return { kind: "stale-version" };
    return { kind: "error" };
  }
  revalidatePath("/", "layout");
  return { kind: "ok" };
}

export async function withdrawProfileDiscoverability(): Promise<ConsentActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  const { data, error } = await asAny(supabase).rpc(
    "withdraw_profile_discoverability_consent",
    { p_source: "dashboard_privacy_screen" },
  );
  if (error) {
    if (error.code && ABSENT.has(error.code)) return { kind: "needs-migration" };
    return { kind: "error" };
  }
  if (!data?.ok) return { kind: "error" };
  revalidatePath("/", "layout");
  return { kind: "ok" };
}

export interface ConsentHistoryRow {
  id: string;
  purpose: string;
  action: string;
  version: string;
  locale: string;
  source: string;
  createdAt: string;
  recipientOrganizationId: string | null;
  contextType: string | null;
  selectedFields: string[] | null;
}

/** The caller's OWN append-only consent history (RLS: user_id = auth.uid()).
 *  Empty on any missing state — never fabricated. */
export async function getMyConsentHistory(): Promise<ConsentHistoryRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await asAny(supabase).rpc("my_privacy_consent_history");
  if (error || !Array.isArray(data)) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((r) => ({
    id: String(r.id),
    purpose: String(r.purpose),
    action: String(r.action),
    version: String(r.consent_text_version),
    locale: String(r.locale),
    source: String(r.source),
    createdAt: String(r.created_at),
    recipientOrganizationId: r.recipient_organization_id
      ? String(r.recipient_organization_id)
      : null,
    contextType: r.context_type ? String(r.context_type) : null,
    selectedFields: Array.isArray(r.selected_fields)
      ? (r.selected_fields as string[])
      : null,
  }));
}
