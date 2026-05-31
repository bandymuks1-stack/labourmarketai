/**
 * Display-only sanitizer for saved demand/customer-request titles (Fix E).
 *
 * Old rows persisted before the §18 cleanup may still carry legacy
 * "Pilot request — …" titles in the database. We never mutate production data;
 * instead the PRODUCT UI runs every saved title through this map so a real user
 * never sees pilot/demo wording. Raw values stay intact for internal/admin
 * surfaces. New submissions already use the de-piloted titles
 * (lib/pilot/pilot-request.ts), so this only rewrites historical rows.
 */
const LEGACY_EXACT: Readonly<Record<string, string>> = {
  "Pilot request — hiring workers": "Hiring workers — demand",
  "Pilot request - hiring workers": "Hiring workers — demand",
  "Pilot request — agency partnership": "Agency partnership — offer",
  "Pilot request - agency partnership": "Agency partnership — offer",
};

export function sanitizeDemandTitle(title: string | null | undefined): string {
  const raw = (title ?? "").trim();
  if (raw === "") return raw;
  const exact = LEGACY_EXACT[raw];
  if (exact) return exact;
  // Generic fallback: strip a leading "Pilot request — " / "Pilot request - "
  // prefix (any case) so no unmapped legacy variant leaks pilot wording.
  const m = raw.match(/^pilot request\s*[—-]\s*(.+)$/i);
  if (m) return m[1].trim();
  return raw;
}
