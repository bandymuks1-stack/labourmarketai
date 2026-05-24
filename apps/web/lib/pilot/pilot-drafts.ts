/**
 * Owner-only pilot draft persistence (migration 0016).
 *
 * One row per (profile_id, draft_type). The UI surfaces one form per
 * draft type and upserts the row on save. Reads use the user-scoped
 * supabase client; RLS scopes rows to `profile_id = auth.uid()` (or
 * `is_admin()` for the admin panel's read-only metrics).
 *
 * Payload is a per-type discriminated union, validated at the action
 * boundary BEFORE write so the DB never holds keys the UI doesn't
 * understand. Unknown keys are dropped silently — defence in depth.
 *
 * Type note: the table is added in 0016; the generated `Database`
 * type does not yet know about it (we'd need `pnpm db:types` after
 * apply). Same boundary-cast pattern as `lib/profile/profile-skill-claims.ts`.
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

function table(supabase: SupabaseClient) {
  // The generated Database type does not yet know about pilot_drafts
  // (migration 0016 — owner applies post-merge). Cast at the boundary;
  // this file is the only place that needs the escape hatch.
  return (
    supabase as unknown as {
      from: (name: string) => ReturnType<SupabaseClient["from"]>;
    }
  ).from("pilot_drafts");
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

/** Read the signed-in user's pilot draft of the given type, or null. */
export async function getPilotDraft(
  type: DraftType,
): Promise<PilotDraftRow | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await table(supabase)
    .select(
      "id, profile_id, draft_type, payload, visibility, created_at, updated_at",
    )
    .eq("profile_id", user.id)
    .eq("draft_type", type)
    .maybeSingle();

  if (error) {
    console.error("[pilot-drafts] get failed:", error.message);
    return null;
  }
  return (data ?? null) as unknown as PilotDraftRow | null;
}

/** Upsert the user's pilot draft of the given type. The UNIQUE
 *  constraint on (profile_id, draft_type) makes the upsert idempotent. */
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
  const { error } = await table(supabase).upsert(
    {
      profile_id: user.id,
      draft_type: type,
      payload,
      // visibility / created_at / updated_at take their defaults.
    },
    { onConflict: "profile_id,draft_type", ignoreDuplicates: false },
  );

  if (error) {
    console.error("[pilot-drafts] save failed:", error.message);
    throw new Error(`save failed: ${error.message}`);
  }

  revalidatePath("/", "layout");
  return getPilotDraft(type);
}

/** Delete the user's pilot draft of the given type. Owner-only via RLS. */
export async function deletePilotDraft(type: DraftType): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await table(supabase)
    .delete()
    .eq("profile_id", user.id)
    .eq("draft_type", type);

  if (error) {
    console.error("[pilot-drafts] delete failed:", error.message);
    throw new Error(`delete failed: ${error.message}`);
  }
  revalidatePath("/", "layout");
}

/** Admin-only: aggregate counts per draft_type. Falls back to {} for
 *  non-admins (RLS prevents the broad read). The admin panel calls
 *  this AFTER its own requireSuperadmin check, but the function is
 *  defence-in-depth: a non-admin call simply returns empty counts. */
export async function getPilotDraftCounts(): Promise<
  Record<DraftType, number>
> {
  const supabase = await createClient();
  const { data, error } = await table(supabase).select("draft_type");
  const counts: Record<DraftType, number> = {
    company_request: 0,
    agency_offer: 0,
    buyer_request: 0,
  };
  if (error || !data) return counts;
  for (const row of data as { draft_type: DraftType }[]) {
    if (row.draft_type in counts) counts[row.draft_type]++;
  }
  return counts;
}

/** Admin-only: list pilot drafts for a single profile (used by the
 *  per-user inspect view). Uses the user-scoped client; admin RLS
 *  allows the broader read via is_admin(). */
export async function listPilotDraftsForProfile(
  profileId: string,
): Promise<PilotDraftRow[]> {
  const supabase = await createClient();
  const { data, error } = await table(supabase)
    .select(
      "id, profile_id, draft_type, payload, visibility, created_at, updated_at",
    )
    .eq("profile_id", profileId)
    .order("draft_type");
  if (error) return [];
  return (data ?? []) as unknown as PilotDraftRow[];
}
