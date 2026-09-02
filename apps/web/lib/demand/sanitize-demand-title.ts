/**
 * Display-only sanitizer for saved demand/customer-request titles (Fix E).
 *
 * Old rows persisted before the §18 cleanup may still carry legacy
 * "Pilot request — …" titles in the database. We never mutate production data;
 * instead the PRODUCT UI runs every saved title through this map so a real user
 * never sees pilot/demo wording. Raw values stay intact for internal/admin
 * surfaces. New submissions already use the de-piloted titles
 * (lib/demand/demand-request.ts), so this only rewrites historical rows.
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

/**
 * SYNTHETIC PLACEHOLDER TITLES (§23 + §39).
 *
 * When an employer submits a need without naming the role, the write path
 * (lib/demand/demand-request.ts) stamps an intent label as the title. Those
 * two labels are ENGLISH, and they are what production actually stores — three
 * live rows carry "Hiring workers — demand" and they render that way to
 * Lithuanian users. The same row is also read by people in other locales, so
 * the stored string can never be right for everyone: a synthetic title is a
 * PLACEHOLDER, and a placeholder belongs to the display layer.
 *
 * We do not migrate the rows (§6: stored history is not rewritten) and we do
 * not change what the write path stores. The display seam simply recognises a
 * synthetic title and lets the caller render its own localized label instead.
 * A title the employer actually typed is never touched.
 */
export type SyntheticDemandTitle = "hiringWorkers" | "agencyPartnership";

const SYNTHETIC: Readonly<Record<string, SyntheticDemandTitle>> = {
  "Hiring workers — demand": "hiringWorkers",
  "Hiring workers - demand": "hiringWorkers",
  "Agency partnership — offer": "agencyPartnership",
  "Agency partnership - offer": "agencyPartnership",
};

/** The placeholder key for a synthetic title, or null for a real one. */
export function syntheticDemandTitleKey(
  title: string | null | undefined,
): SyntheticDemandTitle | null {
  return SYNTHETIC[sanitizeDemandTitle(title)] ?? null;
}

/**
 * Display title: the employer's own words when they named the role, otherwise
 * the caller's localized placeholder. Callers that pass no labels keep the
 * previous behaviour exactly, so this is additive.
 */
export function resolveDemandTitle(
  title: string | null | undefined,
  labels?: Partial<Record<SyntheticDemandTitle, string>>,
): string {
  const clean = sanitizeDemandTitle(title);
  const key = SYNTHETIC[clean];
  if (!key) return clean;
  const label = labels?.[key]?.trim();
  return label && label.length > 0 ? label : clean;
}
