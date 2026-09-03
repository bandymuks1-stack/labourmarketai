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
import { requireEmployerCompany } from "@/lib/company/employer-company-context";
import { recordTelemetryEvent } from "@/lib/telemetry/actions";
import { serverEventLocale } from "@/lib/telemetry/server-locale";
import {
  hasMeaningfulEstimate,
  validateEstimateInputs,
  type EstimateInputs,
} from "@/lib/estimate/estimate";
import { buildEstimatePayload } from "@/lib/estimate/estimate-payload";
import { isWorkTypeSlug, isMarketCountry } from "@/lib/taxonomy/work-categories";
import type { DomainCaller } from "@/lib/domain/caller";
import {
  readStructuredDemandV2,
  sanitizeStructuredDemandV2,
  type StructuredDemandV2,
} from "@/lib/demand/structured-demand-v2";

/** Accommodation offers that are safe to expose on the worker board (enum, no
 *  free text). Mirrors the worker RPC's accommodation whitelist. */
const ACCOMMODATION_OFFER_VALUES = new Set([
  "provided_free",
  "provided_paid",
  "provided_deducted",
  "not_provided",
]);

/** Transport conditions that are safe to expose on the worker board (enum, no
 *  free text) — the §8.5 transport layer, cloned from the accommodation path.
 *  Mirrors the worker RPC's transport whitelist
 *  (20260705200000_worker_demand_transport.sql) EXACTLY. */
const TRANSPORT_OFFER_VALUES = new Set([
  "provided",
  "compensated",
  "not_provided",
  "unknown",
]);

/** Required tools / equipment capabilities that are safe to expose on the
 *  worker board (closed slug set, no free text) — the §8.6 equipment/tools
 *  layer. Every slug is an EXISTING canonical taxonomy skill slug
 *  (lib/taxonomy/profession-skills.ts + messages/{locale}/skill-names.json)
 *  — NO new taxonomy. Mirrors the worker RPC's required-tools whitelist
 *  (20260705210000_worker_demand_required_tools.sql) EXACTLY. */
const REQUIRED_TOOL_SLUGS = new Set([
  "bulldozer-operator",
  "compactor-operator",
  "crane-operator",
  "equipment-operation",
  "excavator-operator",
  "forklift-operator",
  "grader-operator",
  "hand-tools",
  "loader-operator",
  "scaffolding",
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
  /** Transport condition (enum) — optional; unset stays an honest unknown. */
  transport?: string;
  /** Required tools/equipment — closed set of EXISTING taxonomy skill slugs
   *  (§8.6). Optional; unset/empty stays an honest "not stated". */
  requiredTools?: readonly string[];
  /** Structured demand v2 clusters (marketplace precision PR 2) — untrusted
   *  wire input, validated server-side by `sanitizeStructuredDemandV2`
   *  (closed sets, integer cents, cross-field sanity). Stored under
   *  `payload.structured_v2`; owner-side only until the human-gated MP-3
   *  worker-RPC widening. Invalid input is dropped (the request still
   *  submits) — nothing near-valid is salvaged into the canonical payload. */
  structuredV2?: unknown;
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
        // W8 slice 1: the caller is not acting for a company right now
        // (personal workspace, unbound organization, company not owned…).
        | "no_company_context"
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "unauthenticated" };

  // W8 slice 1 — WORKSPACE GATE. A structured employer need belongs to the
  // company the person is acting for; creating one from the personal space (or
  // from an organization with no company binding) would produce a row nothing
  // can later attribute. Refused, never silently written to the profile.
  const employer = await requireEmployerCompany();
  if (!employer.ok) return { ok: false, code: "no_company_context" };

  const result = await submitDemandRequestCore(
    { supabase, userId: user.id },
    { organizationId: employer.organizationId },
    intent,
    fields,
  );
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

/**
 * THE demand submit DOMAIN core (G4 wagon 3) — the same canonical write as an
 * explicit caller, so the web form, the chat executor, and the MCP capability
 * run ONE implementation. The transport resolves the employer context (cookie:
 * `requireEmployerCompany`; bearer: `requireEmployerCompanyForCaller`) and
 * passes only the VALIDATED organization id; every closed-set validation, the
 * v2→v1 RPC fallback, and the structured-column follow-up stay here unchanged.
 */
export async function submitDemandRequestCore(
  caller: DomainCaller,
  employer: { organizationId: string },
  intent: DemandIntent,
  fields?: DemandFields,
): Promise<DemandRequestResult> {
  // Block meaningless creation up-front (defence in depth — the client also
  // disables the create action until a description exists).
  const description = clamp(fields?.description, MAX_TEXT);
  if (description.length === 0) return { ok: false, code: "empty_description" };

  const supabase = caller.supabase;
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
  const transport =
    typeof fields?.transport === "string" &&
    TRANSPORT_OFFER_VALUES.has(fields.transport)
      ? fields.transport
      : null;
  // Required tools (§8.6) — every element must be in the closed slug set;
  // anything else is dropped (never clamped free text). De-duplicated and
  // sorted so the stored list is deterministic; empty → null (honest unknown).
  const requiredTools = Array.isArray(fields?.requiredTools)
    ? [
        ...new Set(
          fields.requiredTools.filter(
            (s): s is string =>
              typeof s === "string" && REQUIRED_TOOL_SLUGS.has(s),
          ),
        ),
      ].sort()
    : [];
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
    // The ONLY payload keys the worker RPC exposes — whitelisted enums /
    // whitelisted slug lists, never free text. Stored here because there is
    // no accommodation/transport/required-tools COLUMN.
    accommodation,
    transport,
    required_tools: requiredTools.length > 0 ? requiredTools : null,
  };

  // Structured demand v2 (PR 2) — validated into the canonical closed-set
  // shape or dropped entirely. NOT worker-exposed (the worker RPC whitelist
  // does not read structured_v2 until MP-3 is owner-approved and applied).
  const structuredV2 = sanitizeStructuredDemandV2(fields?.structuredV2);
  if (structuredV2) payload.structured_v2 = structuredV2;

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

  // M-P0-6: prefer the v2 RPC — it stamps the demand with the VALIDATED
  // active workspace's organization (server re-verifies live membership).
  // Falls back honestly to v1 (unstamped, personal-keyed) while the
  // owner-gated migration is unapplied — never a fake stamp, never a block.
  const rpcArgs = {
    p_kind: kind,
    p_title: title.slice(0, MAX_TITLE),
    // The real user-entered description is the need summary (no fabricated
    // placeholder text). p_original_language stays "lt" — the saved request
    // surfaces on the LT-first owner UI.
    p_need_summary: description,
    p_payload: payload,
    p_original_language: "lt",
  };
  let { data, error } = await (supabase as unknown as DemandRpc).rpc(
    "submit_demand_request_v2",
    { ...rpcArgs, p_organization_id: employer.organizationId },
  );
  if (error && ["42883", "PGRST202"].includes(error.code ?? "")) {
    ({ data, error } = await (supabase as unknown as DemandRpc).rpc(
      "submit_demand_request",
      rpcArgs,
    ));
  }

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
      .eq("profile_id", caller.userId);
    if (upErr) {
      console.error("[demand-request] structured-field update failed:", upErr.message);
      // Observable drift signal (audit F-E3): if RLS/columns ever drift, the
      // worker board silently loses country/team/start metadata — surface it
      // in pilot_events instead of console-only. Fire-and-forget.
      void serverEventLocale()
        .then((locale) =>
          recordTelemetryEvent({
            sessionId: "server:demand-request",
            route: "/dashboard",
            // The REAL request locale, or "unknown" — never a guessed "lt".
            locale,
            eventName: "task_error",
            taskName: "demand_structured_fields",
            result: "error",
            errorCode: upErr.code ?? "update_failed",
          }),
        )
        .catch(() => {});
    }
  }

  return { ok: true, requestId };
}

/**
 * THE demand-creation state fingerprint (G4 wagon 3) — the caller's own most
 * recent `customer_requests` row + own-row count, read under the caller's RLS.
 * A successful submit adds a row, so a confirmation token minted before the
 * write dies as stale_state on replay — genuinely one-time, which matters
 * here because demand creation is NOT idempotent (a replay would create a
 * second demand).
 */
export async function demandStateFingerprint(caller: DomainCaller): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = caller.supabase as any;
    const { data, error } = await sb
      .from("customer_requests")
      .select("id, created_at")
      .eq("profile_id", caller.userId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) return "demand:unreadable";
    const rows = (data ?? []) as { id: string }[];
    return rows.length === 0 ? "demand:none" : `demand:latest:${rows[0].id}`;
  } catch {
    return "demand:unreadable";
  }
}

/** Duplicate-and-edit prefill (Capability E/G repeat action): the owner's own
 *  most recent request of the intent's kind, echoed back as form values. Own
 *  data only (customer_requests RLS: profile_id = auth.uid()); nothing here
 *  reads anyone else's demand. Absent/none → `found: false` (the form stays
 *  empty — no fabricated prefill).
 *
 *  Canonical-journey P3: the same read now understands the owner's DRAFT row
 *  (save_demand_draft payload keys — capabilities/timing/title aliases), and
 *  reports the source (`source: "draft"` + `sourceId`) so the wizard can
 *  (a) auto-continue from the draft instead of asking the company to re-type
 *  everything, and (b) close the draft after the real submit — one canonical
 *  demand row, entered once. */
export type DemandPrefill =
  | { found: false }
  | {
      found: true;
      /** Where the values came from: the owner's private draft or their last
       *  submitted/closed request (duplicate-and-edit). */
      source: "draft" | "request";
      /** The draft row id when source === "draft" — used to close the draft
       *  after the real submit (draft→closed, DB transition-guard-allowed). */
      sourceId: string;
      fields: {
        role: string;
        description: string;
        location: string;
        skills: string;
        urgency: DemandUrgency | null;
        notes: string;
        workType: string | null;
        country: string | null;
        teamSize: number | null;
        accommodation: string | null;
        transport: string | null;
        requiredTools: string[];
      };
      structuredV2: StructuredDemandV2 | null;
    };

export async function getOwnLastDemandPrefill(
  intent: DemandIntent,
): Promise<DemandPrefill> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { found: false };

  // Stage A workspace gate: both intents are EMPLOYER draft/request kinds, so
  // echoing a prefill without a resolved company workspace would leak demand
  // text into the wrong acting context. Fail-closed to the module's honest
  // empty (`found: false` — the form simply starts blank).
  const employer = await requireEmployerCompany();
  if (!employer.ok) return { found: false };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const SELECT_COLS =
    "id, status, title, need_summary, country, role_or_work_type, team_size, start_period, payload";
  // A live draft always wins (the company is mid-flow); otherwise the most
  // recent request of this kind (duplicate-and-edit). Own rows only (RLS).
  const draftRes = await sb
    .from("customer_requests")
    .select(SELECT_COLS)
    .eq("profile_id", user.id)
    .eq("kind", INTENT_KIND[intent])
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let data = draftRes.data;
  if (draftRes.error || !data) {
    const lastRes = await sb
      .from("customer_requests")
      .select(SELECT_COLS)
      .eq("profile_id", user.id)
      .eq("kind", INTENT_KIND[intent])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastRes.error || !lastRes.data) return { found: false };
    data = lastRes.data;
  }

  const isDraft = data.status === "draft";
  const payload =
    data.payload && typeof data.payload === "object"
      ? (data.payload as Record<string, unknown>)
      : {};
  const asText = (v: unknown, max: number) =>
    typeof v === "string" ? v.slice(0, max) : "";
  const urgency = ["flexible", "this_week", "urgent"].includes(
    String(payload.urgency ?? data.start_period ?? ""),
  )
    ? ((payload.urgency ?? data.start_period) as DemandUrgency)
    : null;
  const requiredTools = Array.isArray(payload.required_tools)
    ? payload.required_tools.filter(
        (s): s is string => typeof s === "string" && REQUIRED_TOOL_SLUGS.has(s),
      )
    : [];
  // Draft-payload aliases (save_demand_draft stores the light form's keys):
  // capabilities ≈ what is needed (→ description/skills), timing ≈ when
  // (→ notes when notes are empty — echoed back, never invented).
  const draftCapabilities = asText(payload.capabilities, MAX_TEXT);
  const draftTiming = asText(payload.timing, MAX_TEXT);

  return {
    found: true,
    source: isDraft ? "draft" : "request",
    sourceId: String(data.id),
    fields: {
      role: asText(payload.role, MAX_TITLE) || asText(data.title, MAX_TITLE),
      description: asText(data.need_summary, MAX_TEXT) || draftCapabilities,
      location: asText(payload.location, MAX_TITLE),
      skills: asText(payload.skills, MAX_TEXT) || (isDraft ? draftCapabilities : ""),
      urgency,
      notes:
        asText(payload.notes, MAX_TEXT) ||
        (isDraft && draftTiming ? draftTiming : ""),
      workType:
        typeof data.role_or_work_type === "string" && isWorkTypeSlug(data.role_or_work_type)
          ? data.role_or_work_type
          : null,
      country:
        typeof data.country === "string" && isMarketCountry(data.country)
          ? data.country
          : null,
      teamSize: typeof data.team_size === "number" ? data.team_size : null,
      accommodation:
        typeof payload.accommodation === "string" &&
        ACCOMMODATION_OFFER_VALUES.has(payload.accommodation)
          ? payload.accommodation
          : null,
      transport:
        typeof payload.transport === "string" &&
        TRANSPORT_OFFER_VALUES.has(payload.transport)
          ? payload.transport
          : null,
      requiredTools,
    },
    // A submitted request carries its structured cluster; a DRAFT stores the
    // light form's `opportunityType` string instead — re-validated through
    // the same sanitizer (closed set), so a declared type survives
    // draft → continue and nothing near-valid is salvaged.
    structuredV2:
      readStructuredDemandV2(payload) ??
      (isDraft && typeof payload.opportunityType === "string"
        ? sanitizeStructuredDemandV2({ opportunity_type: payload.opportunityType })
        : null),
  };
}
