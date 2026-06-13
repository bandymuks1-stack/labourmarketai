/**
 * Demand-request submission — the dashboard demand-request CTA, landing on the
 * CANONICAL demand intake `customer_requests` (Phase 3 / Slice 3.1). An
 * authenticated company / agency owner expressing a real need is structured
 * demand, so it writes the one canonical model (status='submitted', classified
 * by `kind`) via the owner-scoped `submit_demand_request` RPC — NOT `/api/leads`.
 *
 * `leads` stays a DISTINCT anonymous pre-auth funnel (§17.2); it is intentionally
 * not the destination for an authenticated structured need. There is exactly one
 * demand model underneath: this submit path and the draft form (save_demand_draft)
 * both write `customer_requests`.
 *
 * Returns a tagged result (never throws across the server-action boundary —
 * Next.js 15 strips thrown Error messages in prod), so the client renders an
 * honest done / error state.
 */
import "server-only";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type DemandIntent = "hire_workers" | "partner";

export type DemandUrgency = "flexible" | "this_week" | "urgent";

/** The structured detail the dashboard demand form collects before creating a
 *  request. `description` is REQUIRED — an empty need is never persisted. */
export type DemandFields = {
  /** Role / work needed (hire) or what's offered (partner). */
  role?: string;
  /** Free-text description of the need — required, non-empty. */
  description: string;
  /** Location / country / context. */
  location?: string;
  /** Required skills / criteria. */
  skills?: string;
  /** Start date / urgency. */
  urgency?: DemandUrgency;
  /** Extra notes. */
  notes?: string;
};

export type DemandRequestResult =
  | { ok: true; requestId: string | null }
  | { ok: false; code: "unauthenticated" | "save_failed" | "empty_description" };

const MAX_TITLE = 120;
const MAX_TEXT = 4000;
const clamp = (s: string | undefined, max: number) =>
  (s ?? "").trim().replace(/\s+/g, " ").slice(0, max);

// hire_workers → a company expressing demand; partner → an agency expressing an
// offer. (The buyer/customer's structured need has its own buyer_request draft
// form; the lightweight demand CTA defaults a company_request.)
const INTENT_KIND: Record<DemandIntent, "company_request" | "agency_offer"> = {
  hire_workers: "company_request",
  partner: "agency_offer",
};

// submit_demand_request + the new demand columns are not in the generated
// `Database` type until `pnpm db:types` runs post-apply — cast at the boundary,
// same pattern lib/demand/demand-drafts.ts uses for the (folded) draft path.
type DemandRpc = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

/**
 * Submit the signed-in owner's structured request onto the canonical intake.
 *
 * `fields.description` is REQUIRED — an empty/whitespace-only need returns
 * `empty_description` and writes NOTHING (no placeholder request, §7). The real
 * user-entered text becomes the request's `p_need_summary`; the role + the rest
 * of the criteria (location, skills, urgency, notes) ride the existing
 * `p_payload` jsonb — so this richer intake needs NO schema migration.
 */
export async function submitDemandRequest(
  intent: DemandIntent,
  fields?: DemandFields,
): Promise<DemandRequestResult> {
  // Block meaningless creation up-front (defence in depth — the client also
  // disables the create action until a description exists).
  const description = clamp(fields?.description, MAX_TEXT);
  if (description.length === 0) return { ok: false, code: "empty_description" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "unauthenticated" };

  const kind = INTENT_KIND[intent];
  const role = clamp(fields?.role, MAX_TITLE);
  // The request title reads from the user's role/work text; falls back to an
  // intent-specific label only when they did not name the role.
  const title =
    role ||
    (intent === "partner" ? "Agency partnership — offer" : "Hiring workers — demand");

  const payload: Record<string, unknown> = {
    source: "dashboard_demand",
    intent,
    role: role || null,
    location: clamp(fields?.location, MAX_TITLE) || null,
    skills: clamp(fields?.skills, MAX_TEXT) || null,
    urgency: fields?.urgency ?? null,
    notes: clamp(fields?.notes, MAX_TEXT) || null,
  };

  const { data, error } = await (supabase as unknown as DemandRpc).rpc(
    "submit_demand_request",
    {
      p_kind: kind,
      p_title: title.slice(0, MAX_TITLE),
      // The real user-entered description is the need summary (no fabricated
      // placeholder text). p_original_language stays "lt" — the saved request
      // surfaces on the LT-first owner UI.
      p_need_summary: description,
      p_payload: payload,
      p_original_language: "lt",
    },
  );

  if (error) {
    console.error("[demand-request] submit failed:", error.message);
    return { ok: false, code: "save_failed" };
  }

  revalidatePath("/", "layout");
  return { ok: true, requestId: typeof data === "string" ? data : null };
}
