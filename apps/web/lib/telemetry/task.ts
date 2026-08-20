/**
 * Client-side task / event tracker (Pilot Telemetry v1).
 *
 * Thin wrapper around the `recordTelemetryEvent` server action. Owns:
 *   - a pseudonymous, per-tab `session_id` cached in sessionStorage so a
 *     single tester's actions correlate across page navigations within
 *     a tab (and don't bleed across tabs);
 *   - a start-time map keyed by task name so `completeTask` /
 *     `errorTask` can compute `duration_ms` without the caller passing
 *     it explicitly;
 *   - a fire-and-forget posting model — telemetry MUST NOT block any
 *     user-visible action. Failures are console-logged, never thrown.
 *
 * What this MUST NOT do:
 *   - Continuous tracking (no `pointermove` / scroll / keystroke / etc).
 *   - Capture raw input bodies (journal text, profile text, comments).
 *   - Take screenshots / video.
 *   - Log auth codes, tokens, cookies, full URLs.
 *   - Pass anything outside the server action's metadata allowlist.
 */

import {
  recordTelemetryEvent,
  type PilotEventResult,
} from "@/lib/telemetry/actions";
import type {
  FunnelEventName,
  FunnelMetadata,
} from "@/lib/telemetry/funnel-events";
import { readLandingMode } from "@/lib/telemetry/landing-experience";
import { isNonProductionHostname } from "@/lib/telemetry/production-host";

const SESSION_KEY = "lm.pilot.session";
const startTimes = new Map<string, number>();

/** Return a stable per-tab pseudonymous session id. Generated lazily on
 *  first use, cached in sessionStorage. Resets on tab close / private
 *  mode storage clear. */
export function getPilotSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    const cached = window.sessionStorage.getItem(SESSION_KEY);
    if (cached && cached.length > 0) return cached;
  } catch {
    /* sessionStorage may be unavailable */
  }
  const fresh = mintSessionId();
  try {
    window.sessionStorage.setItem(SESSION_KEY, fresh);
  } catch {
    /* ignore */
  }
  return fresh;
}

function mintSessionId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  ) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return (
      "s_" +
      Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
    );
  }
  return "s_" + Math.random().toString(16).slice(2, 18);
}

function currentLocale(): string {
  if (typeof document === "undefined") return "lt";
  // The locale prefix is the first path segment in this app
  // (routing.locales). Fall back to 'lt' (default).
  const seg = document.location.pathname.split("/").filter(Boolean)[0];
  if (seg && seg.length <= 4 && /^[a-z]+$/.test(seg)) return seg;
  return "lt";
}

function currentRoute(): string {
  if (typeof document === "undefined") return "/";
  // Path only — no query string (could carry a trace / next / error
  // param; trace is safe but `next` may carry an internal redirect
  // target we'd rather not store).
  return document.location.pathname;
}

/** Fire-and-forget: never throws, never blocks the caller. */
function fire(
  eventName: string,
  result: PilotEventResult,
  opts: {
    taskName?: string | null;
    taskStep?: string | null;
    durationMs?: number | null;
    errorCode?: string | null;
    metadata?: Record<string, unknown> | null;
  } = {},
): void {
  // Skip when there's no window — the helper is used by client
  // components but defensively guards SSR too.
  if (typeof window === "undefined") return;
  const payload = {
    sessionId: getPilotSessionId(),
    route: currentRoute(),
    locale: currentLocale(),
    eventName,
    taskName: opts.taskName ?? null,
    taskStep: opts.taskStep ?? null,
    durationMs: opts.durationMs ?? null,
    result,
    errorCode: opts.errorCode ?? null,
    metadata: opts.metadata ?? null,
  };
  // The server action is async; we deliberately do not await it.
  void recordTelemetryEvent(payload).catch((e) => {
    console.warn("[pilot-events] fire failed", {
      eventName,
      name: e instanceof Error ? e.name : "unknown",
      message: e instanceof Error ? e.message : String(e),
    });
  });
}

/** Public API ───────────────────────────────────────────────────────── */

/** Mark a task as started. Stores a start timestamp so `completeTask`
 *  can report a real `duration_ms`. */
export function startTask(
  taskName: string,
  metadata?: Record<string, unknown>,
): void {
  startTimes.set(taskName, Date.now());
  fire("task_start", "started", { taskName, metadata });
}

/** Mark a mid-task step (e.g. "review_stage_opened"). Does NOT reset
 *  the start timer — duration is measured from the original
 *  `startTask`. */
export function stepTask(
  taskName: string,
  step: string,
  metadata?: Record<string, unknown>,
): void {
  fire("task_step", "info", { taskName, taskStep: step, metadata });
}

/** Mark a task as successfully completed. Computes `duration_ms` from
 *  the last `startTask` call for the same name. */
export function completeTask(
  taskName: string,
  metadata?: Record<string, unknown>,
): void {
  const startedAt = startTimes.get(taskName);
  const durationMs = startedAt ? Date.now() - startedAt : null;
  startTimes.delete(taskName);
  fire("task_complete", "success", { taskName, durationMs, metadata });
}

/** Mark a task as failed (e.g. "save returned error_code=…"). */
export function errorTask(
  taskName: string,
  errorCode: string,
  metadata?: Record<string, unknown>,
): void {
  const startedAt = startTimes.get(taskName);
  const durationMs = startedAt ? Date.now() - startedAt : null;
  startTimes.delete(taskName);
  fire("task_error", "error", {
    taskName,
    durationMs,
    errorCode,
    metadata,
  });
}

/** Mark a task as abandoned (e.g. user navigated away mid-flow).
 *  Use sparingly — automatic abandon detection on every navigation
 *  would amount to continuous tracking, which is forbidden. */
export function abandonTask(
  taskName: string,
  metadata?: Record<string, unknown>,
): void {
  const startedAt = startTimes.get(taskName);
  const durationMs = startedAt ? Date.now() - startedAt : null;
  startTimes.delete(taskName);
  fire("task_abandon", "abandoned", { taskName, durationMs, metadata });
}

/** Record a discrete feature event that isn't bound to a task. Use for
 *  things like `journal_save_success` or `language_feedback_opened`. */
export function recordEvent(
  eventName: string,
  metadata?: Record<string, unknown>,
): void {
  fire(eventName, "info", { metadata });
}

/** Production hosts. Anything else (localhost, 127.0.0.1, *.vercel.app
 *  preview deploys) is a non-production origin whose funnel events must not
 *  pollute the owner's real acquisition metrics.
 *
 *  The rule itself now lives in `production-host.ts` and is shared with the
 *  SERVER emitter, which previously stamped nothing — so one preview session
 *  produced half-marked telemetry (client events excluded, server events
 *  counted as real). */
function isNonProductionHost(): boolean {
  if (typeof window === "undefined") return false;
  return isNonProductionHostname(window.location.hostname);
}

/** Record an activation-funnel event (P0-A). Thin, type-safe wrapper over
 *  `recordEvent`: the event name is constrained to the funnel registry and
 *  metadata to the bounded, non-PII `FunnelMetadata` shape. Same
 *  fire-and-forget guarantees — never throws, never blocks the UI.
 *
 *  Stamps `preview_host: true` on non-production origins (Pre-Advertising
 *  Launch Readiness v1) so dev/preview traffic is excluded from the owner's
 *  real funnel (see lib/admin/conversion-funnel.ts). */
export function trackFunnel(
  eventName: FunnelEventName,
  metadata?: FunnelMetadata,
): void {
  const enriched: Record<string, unknown> = { ...(metadata ?? {}) };
  const landingMode = readLandingMode();
  if (landingMode) enriched.mode = landingMode;
  if (isNonProductionHost()) enriched.preview_host = true;
  fire(eventName, "info", { metadata: enriched });
}

// ── Signup-completion pending flag (Worker Launch Readiness v1) ──────────────
// A brand-new signup and a returning login both land on an authenticated
// surface, so `login_succeeded` alone cannot tell them apart. The signup
// surfaces set this one-shot flag; SessionTelemetry consumes it exactly once
// when the user first reaches an authed page and emits `signup_completed`.
// The value is a bounded surface label ('email' | 'google') — never PII.
const SIGNUP_PENDING_KEY = "lm.funnel.signup_pending";

/** Mark that the current session is a fresh signup, so the next authed
 *  surface can emit `signup_completed`. Bounded surface label only. */
export function markSignupPending(surface: "email" | "google"): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SIGNUP_PENDING_KEY, surface);
  } catch {
    /* localStorage unavailable — signup_completed simply won't fire */
  }
}

/** Read-and-clear the signup-pending flag. Returns the surface label if a
 *  signup is pending (fires `signup_completed` once), else null. */
export function consumeSignupPending(): "email" | "google" | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(SIGNUP_PENDING_KEY);
    if (v === "email" || v === "google") {
      window.localStorage.removeItem(SIGNUP_PENDING_KEY);
      return v;
    }
  } catch {
    /* ignore */
  }
  return null;
}
