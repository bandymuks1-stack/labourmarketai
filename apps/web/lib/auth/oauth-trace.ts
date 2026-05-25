/**
 * Lightweight OAuth-flow trace ids.
 *
 * Production Google login is healthy at the Supabase auth layer (verified
 * 2026-05-25 against `/auth/v1/settings` logs: zero `redirect_uri_mismatch`,
 * zero `exchange_failed`, every PKCE login a clean 200/302). When a real
 * tester DOES report a stuck login, we want a single id that ties together
 * three log surfaces:
 *
 *   1. Browser console — set by `GoogleButton` at click time.
 *   2. Vercel route-handler log — emitted by `/auth/callback`.
 *   3. Supabase auth log — present in the `request_id` Supabase already
 *      stamps onto its own log lines (we can't change theirs, but ours can
 *      include both ids side-by-side).
 *
 * The trace id is NOT a secret — it's a short random hex string, NEVER
 * derived from the auth code or any cookie. Logging it is safe even if a
 * line accidentally leaks.
 *
 * Storage: we cache the last trace id in `sessionStorage` so the callback
 * can correlate even if the OAuth round-trip drops query params (some
 * providers + ad-blocker combos do this). sessionStorage is per-tab, so
 * we never confuse two parallel login attempts in different tabs.
 */

const STORAGE_KEY = "lm.oauth.trace";
const TRACE_QUERY_PARAM = "trace";

/** Short URL-safe random hex string (8 bytes → 16 hex chars). */
export function generateOauthTraceId(): string {
  // crypto.getRandomValues is available in modern browsers + Node 19+.
  // Fall back to Math.random in the unlikely environment without it —
  // collision risk is acceptable for a debug correlation id.
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  ) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return Math.random().toString(16).slice(2, 18).padEnd(16, "0");
}

/** Attach the trace id as a query param. Returns a new URL (does not
 *  mutate the input). */
export function withOauthTraceId(url: URL, traceId: string): URL {
  const out = new URL(url.toString());
  out.searchParams.set(TRACE_QUERY_PARAM, traceId);
  return out;
}

/** Read a trace id off a request URL (string or URL). Returns null when
 *  the param is absent or empty. */
export function readOauthTraceId(url: URL | string): string | null {
  const u = typeof url === "string" ? new URL(url) : url;
  const t = u.searchParams.get(TRACE_QUERY_PARAM);
  return t && t.trim().length > 0 ? t.trim() : null;
}

/** Browser-side cache. Falls back silently if sessionStorage is
 *  unavailable (Safari private mode pre-2018, server-render path, etc.). */
export function rememberOauthTraceId(traceId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, traceId);
  } catch {
    // sessionStorage may throw in private mode / disabled storage.
  }
}

export function recallOauthTraceId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearOauthTraceId(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Recognise hosts that gate the page with Vercel's preview SSO. Owner-
 *  facing copy uses this to honestly tell a tester "Google login can't
 *  be exercised on preview" instead of letting them mash the button.
 *
 *  We don't disable the button — the owner may eventually configure
 *  Supabase + Google to accept preview origins, in which case the button
 *  should still work. The notice is informational only. */
export function isVercelPreviewHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const h = host.toLowerCase();
  // Production deploy is `app.labourmarket.ai`; the Vercel-managed alias
  // for production is `labourmarket-ai.vercel.app` (see memory note
  // `labourmarketai_vercel_topology`). Anything else under `.vercel.app`
  // is a preview branch deploy.
  if (h === "app.labourmarket.ai") return false;
  if (h === "labourmarket-ai.vercel.app") return false;
  return h.endsWith(".vercel.app");
}
