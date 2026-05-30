/**
 * Structured-demand draft persistence — now on the CANONICAL intake
 * `customer_requests` (Phase 3 / Slice 3.1 fold). The "express your need/offer"
 * form is the single demand front door; this module keeps its old
 * getPilotDraft / savePilotDraft API but writes/reads `customer_requests`
 * (status='draft', kind=<draft_type>, payload=<per-type fields>) instead of the
 * retired `pilot_drafts` path. `leads` is a separate pre-auth funnel, not this.
 *
 * Writes go through the `save_demand_draft` SECURITY DEFINER RPC because
 * customer_requests INSERT RLS is admin-only; reads are owner-scoped by RLS
 * (profile_id = auth.uid(), or is_admin() for the admin metrics).
 *
 * Type note: the new columns (kind/payload/original_language) + the RPC are not
 * in the generated `Database` type until `pnpm db:types` runs post-apply — same
 * boundary-cast pattern this file already used for the (now folded) table.
 */
import "server-only";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type DraftType =
  | "company_request"
  | "agency_offer"
  | "buyer_request";

export type CompanyRequestPayload = {
  title?: string;
  capabilities?: string;
  location?: string;
  timing?: string;
  accommodation?: "yes" | "no" | "unknown" | "";
  languages?: string;
  notes?: string;
};

export type AgencyOfferPayload = {
  candidateRoles?: string;
  skillAreas?: string;
  countries?: string;
  languages?: string;
  availability?: string;
  documentation?: string;
  notes?: string;
};

export type BuyerRequestPayload = {
  serviceType?: string;
  location?: string;
  timing?: string;
  budget?: string;
  notes?: string;
};

export type PilotDraftPayload =
  | CompanyRequestPayload
  | AgencyOfferPayload
  | BuyerRequestPayload;

export type PilotDraftRow = {
  id: string;
  profile_id: string;
  draft_type: DraftType;
  payload: PilotDraftPayload;
  visibility: "closed";
  created_at: string;
  updated_at: string;
};

const MAX_FIELD_LEN = 1000;
const MAX_NOTES_LEN = 4000;

// Keys allowed PER draft type. Anything else gets dropped before the
// row is written. Typed as `ReadonlySet<string>` (not
// `ReadonlySet<keyof PilotDraftPayload>`) because the union of payload
// types narrows to only the shared keys — defeating the per-type
// whitelist intent. The allowed-keys check still uses Set.has() so the
// behavior is identical; only the type position is broader.
const ALLOWED_KEYS: Record<DraftType, ReadonlySet<string>> = {
  company_request: new Set<string>([
    "title",
    "capabilities",
    "location",
    "timing",
    "accommodation",
    "languages",
    "notes",
  ]),
  agency_offer: new Set<string>([
    "candidateRoles",
    "skillAreas",
    "countries",
    "languages",
    "availability",
    "documentation",
    "notes",
  ]),
  buyer_request: new Set<string>([
    "serviceType",
    "location",
    "timing",
    "budget",
    "notes",
  ]),
};

// customer_requests is in the generated types, but the new demand columns
// (kind / payload / original_language) + the save_demand_draft RPC are not until
// `pnpm db:types` runs post-apply. Cast at the boundary; this file is the only
// place that needs the escape hatch.
type DemandClient = {
  from: (name: string) => ReturnType<SupabaseClient["from"]>;
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};
function cr(supabase: SupabaseClient) {
  return (supabase as unknown as DemandClient).from("customer_requests");
}
function rowToDraft(r: unknown): PilotDraftRow | null {
  if (r === null || typeof r !== "object") return null;
  const row = r as Record<string, unknown>;
  return {
    id: row.id as string,
    profile_id: row.profile_id as string,
    draft_type: row.kind as DraftType,
    payload: (row.payload ?? {}) as PilotDraftPayload,
    visibility: "closed",
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function sanitize<T extends PilotDraftPayload>(
  type: DraftType,
  raw: unknown,
): T {
  if (raw === null || typeof raw !== "object") return {} as T;
  const out: Record<string, unknown> = {};
  const allowed = ALLOWED_KEYS[type];
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!allowed.has(key)) continue;
    if (typeof value !== "string") continue;
    const cap = key === "notes" ? MAX_NOTES_LEN : MAX_FIELD_LEN;
    const trimmed = value.trim().slice(0, cap);
    if (trimmed.length === 0) continue;
    out[key] = trimmed;
  }
  return out as T;
}

/** Read the signed-in user's structured-demand draft of the given type, or
 *  null. Backed by customer_requests (status='draft', kind=type). */
export async function getPilotDraft(
  type: DraftType,
): Promise<PilotDraftRow | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await cr(supabase)
    .select("id, profile_id, kind, payload, created_at, updated_at")
    .eq("profile_id", user.id)
    .eq("kind", type)
    .eq("status", "draft")
    .maybeSingle();

  if (error) {
    console.error("[demand-draft] get failed:", error.message);
    return null;
  }
  return rowToDraft(data);
}

/** Upsert the user's structured-demand draft of the given type onto the
 *  canonical intake via the owner-scoped save_demand_draft RPC (one draft per
 *  profile+kind enforced by a partial unique index). */
export async function savePilotDraft(
  type: DraftType,
  rawPayload: unknown,
): Promise<PilotDraftRow | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const payload = sanitize(type, rawPayload);
  const title =
    typeof (payload as { title?: unknown }).title === "string"
      ? ((payload as { title?: string }).title ?? null)
      : null;

  const { error } = await (supabase as unknown as DemandClient).rpc(
    "save_demand_draft",
    {
      p_kind: type,
      p_title: title,
      p_payload: payload,
      p_original_language: "lt",
    },
  );

  if (error) {
    console.error("[demand-draft] save failed:", error.message);
    throw new Error(`save failed: ${error.message}`);
  }

  revalidatePath("/", "layout");
  return getPilotDraft(type);
}

/** "Remove" the user's draft of the given type. customer_requests DELETE is
 *  admin-only RLS; an owner closes their own draft (owner UPDATE is allowed),
 *  which honestly takes it out of the draft form. */
export async function deletePilotDraft(type: DraftType): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await cr(supabase)
    .update({ status: "closed" })
    .eq("profile_id", user.id)
    .eq("kind", type)
    .eq("status", "draft");

  if (error) {
    console.error("[demand-draft] delete failed:", error.message);
    throw new Error(`delete failed: ${error.message}`);
  }
  revalidatePath("/", "layout");
}

/** Admin-only: aggregate draft counts per kind (read-only metrics). Non-admins
 *  get empty counts (RLS scopes the read). */
export async function getPilotDraftCounts(): Promise<
  Record<DraftType, number>
> {
  const supabase = await createClient();
  const { data, error } = await cr(supabase).select("kind").eq("status", "draft");
  const counts: Record<DraftType, number> = {
    company_request: 0,
    agency_offer: 0,
    buyer_request: 0,
  };
  if (error || !data) return counts;
  for (const row of data as { kind: DraftType }[]) {
    if (row.kind in counts) counts[row.kind]++;
  }
  return counts;
}

/** Admin-only: list a profile's structured-demand drafts (per-user inspect). */
export async function listPilotDraftsForProfile(
  profileId: string,
): Promise<PilotDraftRow[]> {
  const supabase = await createClient();
  const { data, error } = await cr(supabase)
    .select("id, profile_id, kind, payload, created_at, updated_at")
    .eq("profile_id", profileId)
    .eq("status", "draft")
    .order("kind");
  if (error) return [];
  return (data ?? [])
    .map(rowToDraft)
    .filter((x): x is PilotDraftRow => x !== null);
}
