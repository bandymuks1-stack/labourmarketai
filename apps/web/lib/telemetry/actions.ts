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
  | { ok: true; id: string }
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fromAny = (supabase as any).from.bind(supabase) as (
    name: string,
  ) => {
    insert: (row: Record<string, unknown>) => {
      select: (cols: string) => {
        single: () => Promise<{
          data: { id: string } | null;
          error: { message?: string } | null;
        }>;
      };
    };
  };

  const { data: row, error } = await fromAny("pilot_events")
    .insert({
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
    })
    .select("id")
    .single();

  if (error || !row) {
    console.error("[pilot-events] insert failed:", error?.message);
    return {
      ok: false,
      code: "insert_failed",
      message: `pilot_events insert rejected: ${error?.message ?? "unknown"}`,
    };
  }
  return { ok: true, id: row.id as string };
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
