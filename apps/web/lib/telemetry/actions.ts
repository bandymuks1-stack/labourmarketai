"use server";

import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Pilot telemetry server action — single entry point for any client-side
 * task event (page_view / task_start / task_step / task_complete /
 * task_abandon / task_error / a small set of feature events). Inserts
 * into `public.pilot_events` (see migration 0020).
 *
 * Privacy contract (enforced here AND pinned by guard tests):
 *   - `metadata` keys are whitelisted; anything outside the allowlist
 *     is dropped server-side before the insert.
 *   - String VALUES inside `metadata` are capped at 200 chars (longer =
 *     trimmed). The OVERALL metadata JSON is rejected past 2 KB serialized.
 *   - Bounded scalar columns: route ≤240, locale ≤16, event_name ≤64,
 *     task_name ≤64, task_step ≤64, error_code ≤64, app_version ≤64,
 *     session_id ≤64. Mirrors the DB check constraints in 0020.
 *   - profile_id is derived from `supabase.auth.getUser()` server-side
 *     — the client never says who it is. NULL for anon callers.
 *   - We DO NOT log the auth code, cookies, tokens, full URL, or any
 *     free-text profile / journal body. The action returns a tagged
 *     result so callers can tell why a record was rejected.
 */
export type TelemetryEventInput = {
  sessionId: string;
  route: string;
  locale: string;
  eventName: string;
  taskName?: string | null;
  taskStep?: string | null;
  durationMs?: number | null;
  result?: PilotEventResult;
  errorCode?: string | null;
  metadata?: Record<string, unknown> | null;
  appVersion?: string | null;
};

export type PilotEventResult =
  | "started"
  | "success"
  | "error"
  | "abandoned"
  | "info";

export type RecordPilotEventResult =
  | { ok: true }
  | { ok: false; code: PilotEventErrorCode; message: string };

export type PilotEventErrorCode =
  | "missing_session"
  | "missing_route"
  | "missing_event_name"
  | "metadata_too_large"
  | "metadata_invalid"
  | "insert_failed"
  | "unknown_error";

/** Server-side allowlist for keys permitted inside `metadata`. Adding a
 *  key here is a deliberate decision — never wildcard. */
const ALLOWED_METADATA_KEYS = new Set<string>([
  "trace", // OAuth trace id (already a non-secret 16-hex from oauth-trace.ts)
  "provider", // 'google' for the OAuth event
  "origin", // window.location.origin (host only, no path / query)
  "draft_type", // 'company_request' | 'agency_offer' | 'buyer_request'
  "fragment_count", // # of journal fragments parsed
  "unresolved_unknown_count", // # of unknown-phrase cards left unlabelled
  "skill_count", // # of skills the user accepted/dismissed in one action
  "preview_host", // bool — was the tester on a vercel.app preview?
  "had_selection", // bool — language-feedback widget: was text highlighted?
  "comment_length", // language-feedback widget: chars typed (number only)
  "result_kind", // free-text-but-bounded summary, e.g. 'soft_delete' / 'supersede'
  // ── Activation-funnel dims (P0-A) — bounded, non-identifying scalars.
  //    See lib/telemetry/funnel-events.ts (FunnelMetadata). NEVER ids/PII.
  "surface", // source surface, e.g. 'dashboard' | 'profile' | 'google'
  "step", // coarse step label inside a multi-step flow, e.g. 'compose'
  "role_context", // coarse role: 'worker' | 'company' | 'agency' | 'customer'
  "entity_type", // anonymous entity type, e.g. 'company_request'
  "success", // bool — coarse success/failure of an attempted action
  // ── Public acquisition funnel + first-touch attribution (Pre-Advertising
  //    Launch Readiness v1). All bounded, sanitized scalars. NEVER a raw
  //    query string, a full referrer URL, or any user-entered value.
  //    See lib/telemetry/attribution.ts + funnel-events.ts (FunnelMetadata).
  "audience", // coarse marketing audience: 'workers' | 'companies' | 'agencies' | 'home'
  "cta_id", // stable non-PII CTA identifier, e.g. 'hero_signup'
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "referrer_host", // referrer HOST only, never the full URL
  "landing_path", // first landing path (no query string)
  "mode", // canonical landing presentation: 'live' | 'focus'
  // ── Mid-funnel marketplace events (W14 Pilot Analytics slice v1).
  "candidate_count", // number — how many candidates a match preview produced
  // ── M-P0-8 organization-aware attribution (server-resolved in
  //    lib/telemetry/analytics-attribution.ts — a call site can pass these
  //    but the server-funnel emitter stamps them from the VALIDATED active
  //    workspace, so a fabricated org never enters through the front door;
  //    ids are opaque uuids, not PII).
  "workspace_type", // 'personal' | 'organization'
  "organization_id", // the validated active workspace's organization (uuid)
  "org_role", // governance role behind the workspace (owner|admin|manager|…)
  "billing_subject", // M-P0-7 canonical subject: 'profile' | 'organization'
  "ref_type", // referenced entity type: 'project' | 'booking' | 'engagement'
  "ref_id", // referenced entity id (opaque uuid)
]);

const SCALAR_VALUE_MAX = 200;
const METADATA_BYTE_MAX = 2048;

export async function recordTelemetryEvent(
  input: TelemetryEventInput,
): Promise<RecordPilotEventResult> {
  const sessionId = (input.sessionId ?? "").trim().slice(0, 64);
  const route = (input.route ?? "").trim().slice(0, 240);
  const locale = (input.locale ?? "lt").trim().slice(0, 16);
  const eventName = (input.eventName ?? "").trim().slice(0, 64);
  const taskName = input.taskName ? String(input.taskName).slice(0, 64) : null;
  const taskStep = input.taskStep ? String(input.taskStep).slice(0, 64) : null;
  const result: PilotEventResult = input.result ?? "info";
  const errorCode = input.errorCode ? String(input.errorCode).slice(0, 64) : null;
  const durationMs =
    typeof input.durationMs === "number" &&
    Number.isFinite(input.durationMs) &&
    input.durationMs >= 0
      ? Math.floor(input.durationMs)
      : null;
  const appVersion = input.appVersion
    ? String(input.appVersion).slice(0, 64)
    : null;

  if (!sessionId) {
    return {
      ok: false,
      code: "missing_session",
      message: "session_id is required (mint via lib/telemetry/task.ts).",
    };
  }
  if (!route) {
    return { ok: false, code: "missing_route", message: "route is required." };
  }
  if (!eventName) {
    return {
      ok: false,
      code: "missing_event_name",
      message: "event_name is required.",
    };
  }

  const sanitizedMetadata = sanitizeMetadata(input.metadata ?? {});
  if (sanitizedMetadata === "too_large") {
    return {
      ok: false,
      code: "metadata_too_large",
      message: `metadata exceeded ${METADATA_BYTE_MAX} bytes serialized.`,
    };
  }
  if (sanitizedMetadata === "invalid") {
    return {
      ok: false,
      code: "metadata_invalid",
      message: "metadata must be a flat object of allowlisted keys.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profileId = user?.id ?? null;

  // The generated `Database` type doesn't include `pilot_events` until
  // `pnpm db:types` is re-run after 0020 is applied. Cast supabase.from
  // through `any` so the static name check passes — RLS still enforces
  // row-level ownership + admin-only SELECT at runtime.
  //
  // INSERT ONLY — never chain a select after this insert. A chained select
  // makes PostgREST issue `INSERT … RETURNING`, and Postgres applies the
  // table's SELECT policy to the RETURNING rows. `pilot_events_select` is
  // admin-only (0020), so a RETURNING insert from any non-admin (every
  // worker/company/anon caller) fails 42501 and the event row is LOST —
  // this silently dropped all non-admin telemetry in production.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fromAny = (supabase as any).from.bind(supabase) as (
    name: string,
  ) => {
    insert: (
      row: Record<string, unknown>,
    ) => Promise<{ error: { message?: string } | null }>;
  };

  const { error } = await fromAny("pilot_events").insert({
    profile_id: profileId,
    session_id: sessionId,
    route,
    locale,
    event_name: eventName,
    task_name: taskName,
    task_step: taskStep,
    duration_ms: durationMs,
    result,
    error_code: errorCode,
    metadata: sanitizedMetadata,
    app_version: appVersion,
  });

  if (error) {
    console.error("[pilot-events] insert failed:", error.message);
    return {
      ok: false,
      code: "insert_failed",
      message: `pilot_events insert rejected: ${error.message ?? "unknown"}`,
    };
  }
  return { ok: true };
}

/** Build a safe metadata object: allowlist keys, cap string values,
 *  reject jsonification failures, reject oversized payloads. Returns the
 *  sanitized object on success, `"too_large"` or `"invalid"` otherwise. */
function sanitizeMetadata(
  raw: Record<string, unknown>,
): Record<string, unknown> | "too_large" | "invalid" {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return "invalid";
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!ALLOWED_METADATA_KEYS.has(k)) continue;
    if (v === null || v === undefined) continue;
    if (typeof v === "string") {
      out[k] = v.slice(0, SCALAR_VALUE_MAX);
    } else if (typeof v === "number") {
      // Reject NaN / Infinity (they don't survive JSON).
      if (Number.isFinite(v)) out[k] = v;
    } else if (typeof v === "boolean") {
      out[k] = v;
    } else {
      // Reject nested objects / arrays — telemetry stays flat by design.
      // (If a future event needs structure, allowlist the key + the
      // nested shape together.)
      continue;
    }
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(out);
  } catch {
    return "invalid";
  }
  if (Buffer.byteLength(serialized, "utf8") > METADATA_BYTE_MAX) {
    return "too_large";
  }
  return out;
}
