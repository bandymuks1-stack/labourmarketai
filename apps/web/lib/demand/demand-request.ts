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
import {
  hasMeaningfulEstimate,
  validateEstimateInputs,
  type EstimateInputs,
} from "@/lib/estimate/estimate";
import { buildEstimatePayload } from "@/lib/estimate/estimate-payload";
import { isWorkTypeSlug, isMarketCountry } from "@/lib/taxonomy/work-categories";

/** Accommodation offers that are safe to expose on the worker board (enum, no
 *  free text). Mirrors the worker RPC's accommodation whitelist. */
const ACCOMMODATION_OFFER_VALUES = new Set([
  "provided_free",
  "provided_paid",
  "provided_deducted",
  "not_provided",
]);

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
  /** Optional preliminary estimate inputs — stored in payload.estimate when the
   *  user filled it in. Recomputed server-side; never trusted from the client. */
  estimate?: EstimateInputs;
  // ── Structured, worker-board-safe fields ──────────────────────────────────
  // These populate the structured customer_requests columns (role_or_work_type
  // / country / team_size / start_period) + the whitelisted payload.accommodation
  // so the worker opportunities board can show useful, NON-personal facts. The
  // free-text fields above (role/location/skills/notes) stay in payload and are
  // NEVER exposed to workers.
  /** Work-type slug from the shared taxonomy (lib/taxonomy/work-categories). */
  workType?: string;
  /** ISO-3166 alpha-2 market country. */
  country?: string;
  /** Number of workers needed. */
  teamSize?: number;
  /** Accommodation offer (enum). */
  accommodation?: string;
};

export type DemandRequestResult =
  | { ok: true; requestId: string | null }
  | {
      ok: false;
      code:
        | "unauthenticated"
        | "save_failed"
        // The submit RPC / a column is not present in the live DB (function or
        // relation missing). Surfaced honestly so the user sees "awaiting a DB
        // update" instead of a generic "try again" that hides the real cause.
        | "needs_migration"
        | "empty_description"
        | "invalid_estimate";
    };

/**
 * Map a Postgres/PostgREST error code to a result code, instead of collapsing
 * every failure into a generic "save_failed" (which masks a missing RPC/column
 * behind "try again"). Mirrors the convention used across the app
 * (lib/demand/demand-location.ts, lib/worker/work-card-actions.ts, etc.).
 *   42883 = undefined_function, PGRST202 = function not found in schema cache,
 *   42P01 = undefined_table, 42703 = undefined_column → not applied in prod.
 */
function classifyDbError(code: string | undefined): "needs_migration" | "save_failed" {
  if (code && ["42883", "PGRST202", "42P01", "42703"].includes(code)) {
    return "needs_migration";
  }
  return "save_failed";
}

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
  ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
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

  // ── Structured, worker-board-safe values ──────────────────────────────────
  // Each is validated against a CLOSED set so a client can never inject free
  // text into the columns/keys the worker board exposes.
  const workType =
    typeof fields?.workType === "string" && isWorkTypeSlug(fields.workType)
      ? fields.workType
      : null;
  const country =
    typeof fields?.country === "string" && isMarketCountry(fields.country.toUpperCase())
      ? fields.country.toUpperCase()
      : null;
  const teamSize =
    typeof fields?.teamSize === "number" &&
    Number.isInteger(fields.teamSize) &&
    fields.teamSize > 0 &&
    fields.teamSize <= 100000
      ? fields.teamSize
      : null;
  const accommodation =
    typeof fields?.accommodation === "string" &&
    ACCOMMODATION_OFFER_VALUES.has(fields.accommodation)
      ? fields.accommodation
      : null;
  // The urgency enum is a safe, structured timing signal → stored as start_period.
  const startPeriod = fields?.urgency ?? null;

  const payload: Record<string, unknown> = {
    source: "dashboard_demand",
    intent,
    role: role || null,
    location: clamp(fields?.location, MAX_TITLE) || null,
    skills: clamp(fields?.skills, MAX_TEXT) || null,
    urgency: fields?.urgency ?? null,
    notes: clamp(fields?.notes, MAX_TEXT) || null,
    // The ONLY payload key the worker RPC exposes — a whitelisted enum, never
    // free text. Stored here because there is no accommodation COLUMN.
    accommodation,
  };

  // Optional preliminary estimate. Only persisted when the user actually filled
  // it in; if engaged but invalid (negatives / impossible %), block — an invalid
  // estimate is never stored. The result is RECOMPUTED here (deterministic), so
  // a client cannot inject a fabricated total.
  if (fields?.estimate && hasMeaningfulEstimate(fields.estimate)) {
    if (validateEstimateInputs(fields.estimate, true).length > 0) {
      return { ok: false, code: "invalid_estimate" };
    }
    const stored = buildEstimatePayload(fields.estimate);
    if (stored) payload.estimate = stored;
  }

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
    // Log the code too so prod logs disambiguate a missing RPC (42883/PGRST202)
    // from a transient failure — the old log dropped it.
    console.error("[demand-request] submit failed:", error.code, error.message);
    return { ok: false, code: classifyDbError(error.code) };
  }

  const requestId = typeof data === "string" ? data : null;

  // Populate the structured, worker-board-safe COLUMNS on the row just created
  // — an owner-scoped UPDATE under the existing customer_requests RLS
  // (using profile_id = auth.uid()). No migration, no RPC change, no admin op.
  // Best-effort: a failure here never fails the submit (the request is already
  // saved); the worker board just shows generic labels until columns are set.
  if (requestId && (workType || country || teamSize != null || startPeriod)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { error: upErr } = await sb
      .from("customer_requests")
      .update({
        role_or_work_type: workType,
        country,
        team_size: teamSize,
        start_period: startPeriod,
      })
      .eq("id", requestId)
      .eq("profile_id", user.id);
    if (upErr) {
      console.error("[demand-request] structured-field update failed:", upErr.message);
    }
  }

  revalidatePath("/", "layout");
  return { ok: true, requestId };
}
