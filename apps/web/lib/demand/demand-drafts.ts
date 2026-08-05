/**
 * Structured-demand draft persistence — now on the CANONICAL intake
 * `customer_requests` (Phase 3 / Slice 3.1 fold). The "express your need/offer"
 * form is the single demand front door; this module keeps its old
 * getDemandDraft / saveDemandDraft API but writes/reads `customer_requests`
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
import { requireEmployerCompany } from "@/lib/company/employer-company-context";

export type DraftType =
  | "company_request"
  | "agency_offer"
  | "buyer_request";

/**
 * Org demand spine — Stage A (surface gates, zero migration).
 *
 * The EMPLOYER draft kinds are demand-chain data and must be workspace-gated
 * through the ONE canonical resolver (fail-closed, named reasons, no
 * profile-only fallback). `buyer_request` is deliberately NOT in this set: the
 * buyer spine is the customer identity (a person OR a company action, keyed to
 * the self-owned `customers` row) — an employer workspace gate here would
 * fail-closed every person-buyer in their personal space, which is a different
 * actor, not an employer surface.
 */
const EMPLOYER_DRAFT_TYPES: ReadonlySet<DraftType> = new Set([
  "company_request",
  "agency_offer",
]);

export type CompanyRequestPayload = {
  title?: string;
  capabilities?: string;
  location?: string;
  timing?: string;
  /** Organisation's role ON THIS need — situational, not a permanent identity. */
  projectRole?:
    | "client"
    | "general_contractor"
    | "contractor"
    | "subcontractor"
    | "labour_supplier"
    | "service_provider"
    | "other"
    | "";
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

export type DemandDraftPayload =
  | CompanyRequestPayload
  | AgencyOfferPayload
  | BuyerRequestPayload;

export type DemandDraftRow = {
  id: string;
  profile_id: string;
  draft_type: DraftType;
  payload: DemandDraftPayload;
  visibility: "closed";
  created_at: string;
  updated_at: string;
};

const MAX_FIELD_LEN = 1000;
const MAX_NOTES_LEN = 4000;

// Keys allowed PER draft type. Anything else gets dropped before the
// row is written. Typed as `ReadonlySet<string>` (not
// `ReadonlySet<keyof DemandDraftPayload>`) because the union of payload
// types narrows to only the shared keys — defeating the per-type
// whitelist intent. The allowed-keys check still uses Set.has() so the
// behavior is identical; only the type position is broader.
const ALLOWED_KEYS: Record<DraftType, ReadonlySet<string>> = {
  company_request: new Set<string>([
    "title",
    "capabilities",
    "location",
    "timing",
    "projectRole",
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
function rowToDraft(r: unknown): DemandDraftRow | null {
  if (r === null || typeof r !== "object") return null;
  const row = r as Record<string, unknown>;
  return {
    id: row.id as string,
    profile_id: row.profile_id as string,
    draft_type: row.kind as DraftType,
    payload: (row.payload ?? {}) as DemandDraftPayload,
    visibility: "closed",
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function sanitize<T extends DemandDraftPayload>(
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
export async function getDemandDraft(
  type: DraftType,
): Promise<DemandDraftRow | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Stage A workspace gate: an employer draft may only be read while the
  // caller is actually acting for a company (fail-closed; null = the form
  // simply starts empty, no other tenant's / context's draft is echoed).
  if (EMPLOYER_DRAFT_TYPES.has(type)) {
    const employer = await requireEmployerCompany();
    if (!employer.ok) return null;
  }

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
export async function saveDemandDraft(
  type: DraftType,
  rawPayload: unknown,
): Promise<DemandDraftRow | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Stage A workspace gate (same fail-closed contract as the submit path in
  // lib/demand/demand-request.ts): an employer draft written from the personal
  // space / an unbound organization would produce a row nothing can later
  // attribute — refused with the module's established failure shape (throw).
  if (EMPLOYER_DRAFT_TYPES.has(type)) {
    const employer = await requireEmployerCompany();
    if (!employer.ok) {
      throw new Error(`no company context: ${employer.reason}`);
    }
  }

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
  return getDemandDraft(type);
}

/** "Remove" the user's draft of the given type. customer_requests DELETE is
 *  admin-only RLS; an owner closes their own draft (owner UPDATE is allowed),
 *  which honestly takes it out of the draft form. */
export async function deleteDemandDraft(type: DraftType): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Stage A workspace gate — same rule as the save path above.
  if (EMPLOYER_DRAFT_TYPES.has(type)) {
    const employer = await requireEmployerCompany();
    if (!employer.ok) {
      throw new Error(`no company context: ${employer.reason}`);
    }
  }

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
export async function getDemandDraftCounts(): Promise<
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
export async function listDemandDraftsForProfile(
  profileId: string,
): Promise<DemandDraftRow[]> {
  const supabase = await createClient();
  const { data, error } = await cr(supabase)
    .select("id, profile_id, kind, payload, created_at, updated_at")
    .eq("profile_id", profileId)
    .eq("status", "draft")
    .order("kind");
  if (error) return [];
  return (data ?? [])
    .map(rowToDraft)
    .filter((x): x is DemandDraftRow => x !== null);
}
