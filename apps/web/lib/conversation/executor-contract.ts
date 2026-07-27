/**
 * Shared executor contract (Phase B / PR-E). The ONE result shape + tiny
 * adapter helpers used by both executor maps (`worker-executors.ts` and
 * `company-executors.ts`). Kept PURE (no server-only, no supabase, no IO) so
 * unit tests can import an executor map with every canonical action module
 * mocked, without dragging the other side's canonical imports along.
 */

export type ExecResult =
  | { ok: true; data?: Record<string, unknown> }
  | { ok: false; code: string; message?: string; existing?: string };

export type ExecCtx = { locale: string };

/** Build a FormData for the canonical formData-shaped server actions. */
export function fd(entries: Record<string, string | null | undefined>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) {
    if (v != null) f.set(k, v);
  }
  return f;
}

/** Map the canonical layers' kebab-tagged result kinds to the common snake
 *  code set. Covers the worker tags (booking/interest) and the employer tags
 *  (lifecycle/shortlist/bridge). Unknown tags collapse to "error" — never to
 *  success. */
export function mapKind(kind: string): string {
  switch (kind) {
    case "needs-migration":
      return "needs_migration";
    case "not-authed":
      return "auth";
    case "not-entitled":
      return "not_authorized";
    case "rate-limited":
      return "rate_limited";
    case "no-worker":
    case "invalid":
      return "invalid";
    case "not-visible":
      return "precondition";
    case "conflict":
      return "conflict";
    // Employer-side canonical tags (lifecycle / shortlist / bridge results):
    case "not-owner":
      return "not_authorized";
    case "not-found":
      return "not_found";
    case "reason-required":
      return "reason_required";
    case "nothing-to-confirm":
      return "nothing_to_confirm";
    default:
      return "error";
  }
}
