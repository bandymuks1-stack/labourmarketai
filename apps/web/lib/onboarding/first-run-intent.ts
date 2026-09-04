/**
 * Universal first-run router — PURE (no React, no Supabase).
 *
 * After sign-in a new user is asked ONE small question — what they came to
 * do — and the answer is routed into the canonical identity model instead of
 * into a generic dashboard. Five intents, TWO base identities (owner
 * directives company-role-simplicity-v1 + systemic-ux-roles-v1):
 *
 *   work       → person  (worker)
 *   student    → person  (worker) + a CURRENT education record — the
 *                canonical "I am studying" state (worker_education.is_current)
 *                that the institution link later attaches to; a student is a
 *                person whose evidence starts in learning.
 *   hire       → company (employer)
 *   agency     → company with company_type = 'staffing_agency' — an agency is
 *                a company TYPE, never a root role.
 *   education  → company that declares the `training_provider` capability —
 *                an institution is an organisation with an education role.
 *
 * Nothing here creates a fifth account system: intents only decide which of
 * the two identities to open and what the FIRST setup screen pre-fills.
 * A person may pick several intents (student who also looks for work; owner
 * who hires and also runs an agency) — the identities are unioned, the
 * presets are merged, and the user can switch context later.
 */

export const FIRST_RUN_INTENTS = [
  "work",
  "hire",
  "agency",
  "student",
  "education",
] as const;
export type FirstRunIntent = (typeof FIRST_RUN_INTENTS)[number];

/** The two base identities the product actually has. */
export type FirstRunIdentity = "worker" | "company";

export const INTENT_IDENTITY: Readonly<Record<FirstRunIntent, FirstRunIdentity>> = {
  work: "worker",
  student: "worker",
  hire: "company",
  agency: "company",
  education: "company",
};

export function isFirstRunIntent(value: string): value is FirstRunIntent {
  return (FIRST_RUN_INTENTS as readonly string[]).includes(value);
}

/** Parse a comma-separated intent list (form field). Unknown values are
 *  dropped, duplicates collapsed, canonical order restored. */
export function parseFirstRunIntents(raw: string | null | undefined): FirstRunIntent[] {
  if (!raw) return [];
  const picked = new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(isFirstRunIntent),
  );
  return FIRST_RUN_INTENTS.filter((i) => picked.has(i));
}

/** Identities implied by the intents, in the canonical order the onboarding
 *  action expects (worker before company → primary derivation is stable). */
export function identitiesForIntents(
  intents: readonly FirstRunIntent[],
): FirstRunIdentity[] {
  const set = new Set(intents.map((i) => INTENT_IDENTITY[i]));
  return (["worker", "company"] as const).filter((id) => set.has(id));
}

/** A profession is asked only when the person came to WORK. A student may
 *  not have one yet — asking would put a fact on them they did not state. */
export function professionRequiredForIntents(
  intents: readonly FirstRunIntent[],
): boolean {
  return intents.includes("work");
}

export function asksForCurrentEducation(intents: readonly FirstRunIntent[]): boolean {
  return intents.includes("student");
}

export type CompanyPreset = {
  /** companies.company_type to pre-select on the setup form. */
  readonly companyType?: "staffing_agency";
  /** organisation capability slug to declare right after the company exists. */
  readonly capability?: "training_provider";
};

/** What the FIRST company setup screen should pre-fill. `null` when no
 *  company identity was chosen. */
export function companyPresetForIntents(
  intents: readonly FirstRunIntent[],
): CompanyPreset | null {
  if (!intents.some((i) => INTENT_IDENTITY[i] === "company")) return null;
  const preset: { companyType?: "staffing_agency"; capability?: "training_provider" } = {};
  if (intents.includes("agency")) preset.companyType = "staffing_agency";
  if (intents.includes("education")) preset.capability = "training_provider";
  return preset;
}

/**
 * The locale-less internal path onboarding should return to. A company
 * identity goes straight to the ONE canonical company setup form (with its
 * presets in the query) instead of a cockpit that would only send it there.
 * `null` = let the action's role-aware default decide (worker → guided
 * profile setup).
 *
 * NO `?new=1` here (real-pilot fix, 2026-09-04): `complete_onboarding` has
 * already inserted the person's ONE company row (an unnamed shell) by the
 * time this path is followed, so the setup page must EDIT that row — with
 * `new=1` it created a second company and the workspace resolver then saw
 * two organisations, no pointer, and rendered "no company profile" (seen on
 * production 2026-09-02). The page's own rule — one owned company → edit it
 * — is exactly what a first company setup needs.
 */
export function nextPathForIntents(intents: readonly FirstRunIntent[]): string | null {
  const preset = companyPresetForIntents(intents);
  if (!preset) {
    // A student lands on the Learning Compass — the student home that the
    // current-education row they just created makes render — instead of the
    // generic worker setup card that says nothing about studying.
    return intents.includes("student") ? "/dashboard/profile#learning-compass" : null;
  }
  const params = new URLSearchParams();
  if (preset.companyType) params.set("type", preset.companyType);
  if (preset.capability) params.set("capability", preset.capability);
  const qs = params.toString();
  return qs ? `/dashboard/start/company?${qs}` : "/dashboard/start/company";
}
