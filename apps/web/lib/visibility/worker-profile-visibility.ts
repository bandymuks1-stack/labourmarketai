/**
 * WORKER PROFILE VISIBILITY — central policy module (Step 3A foundation).
 *
 * The single source of truth for what a company / client may see about a worker
 * BEFORE any company-facing matching, shortlist, or communication surface is
 * built. Doctrine §4 (default-closed) and §7 (encode the negative-visibility
 * rules so they survive refactors). Pure logic, no IO, deterministic.
 *
 * Owner-approved visibility rules (2026-06-13), encoded here:
 *   1. A company/client may see a worker PROFILE PREVIEW only when there is a
 *      direct relation: directly employed/assigned, agency relation, or the
 *      worker works on the client's object/project.  -> canViewProfilePreview()
 *   2. Worker CONTACT details are ALWAYS hidden by default.  -> the preview
 *      shapes below never carry a contact channel; canViewWorkerContact()===false.
 *   3. A contact-exposure exception may exist LATER only inside a paid service /
 *      job-ads / match-purchase flow — NOT implemented now (no paid unlock).
 *   4. Shortlist uses anonymized / profile-safe data only.  -> toShortlistSafePreview()
 *   5. Profile-safe fields allowed for now: skills, location, availability, rate,
 *      evidence count (+ non-contact summary already public-safe: headline,
 *      experience years, preferred countries, available-from date).
 *   6. Communication/booking may start only when the worker has a free schedule
 *      OR an available-from date.  -> canStartCommunicationOrBooking()
 *
 * This module STRIPS by construction: the preview builders read only the
 * allow-listed non-contact fields, so even if the raw input object carries
 * phone/email/address/bio/CV/private text, the output never contains them.
 * `assertContactSafe()` is the runtime net that fails loudly if that invariant
 * is ever broken.
 *
 * NOTE: contact data (profiles.phone/email/full_name) is already DB-protected —
 * profiles RLS is self+admin only, and the employer-readable `workers` row
 * carries no contact channel. This module is the application-layer guarantee on
 * top of that, so company-facing selectors can never assemble a contact view.
 */

/** Non-contact fields allowed in a profile-safe worker preview. */
export const PROFILE_SAFE_PREVIEW_FIELDS = [
  "workerId",
  "headline",
  "skills",
  "location",
  "preferredCountries",
  "availability",
  "availableFrom",
  "rate",
  "evidenceCount",
  "experienceYears",
] as const;

/**
 * Substrings that must NEVER appear as a key in any company-facing preview.
 * Covers contact channels, names, private narrative/documents, and personal
 * identifiers. Matched case-insensitively against output keys.
 */
export const FORBIDDEN_PREVIEW_KEY_PATTERNS = [
  "phone",
  "mobile",
  "email",
  "whatsapp",
  "telegram",
  "viber",
  "signal",
  "contact",
  "address",
  "fullname",
  "full_name",
  "displayname",
  "display_name",
  "profile_text",
  "profiletext",
  "bio",
  "cv",
  "resume",
  "message",
  "passport",
  "iban",
  "ssn",
  "birth",
] as const;

/** Raw worker input. Contact fields may be present; they are never read. */
export interface WorkerRecordInput {
  readonly id: string;
  readonly headline?: string | null;
  readonly skills?: readonly string[] | null;
  readonly locationCountry?: string | null;
  readonly preferredCountries?: readonly string[] | null;
  readonly availabilityStatus?: string | null;
  readonly availableFrom?: string | null;
  readonly rateMinEur?: number | null;
  readonly rateMaxEur?: number | null;
  readonly evidenceCount?: number | null;
  readonly experienceYears?: number | null;
}

/** The ONLY shape a company/client may receive for a worker preview. */
export interface WorkerProfileSafePreview {
  readonly kind: "worker_profile_safe_preview";
  readonly workerId: string;
  readonly headline: string | null;
  readonly skills: readonly string[];
  readonly location: string | null;
  readonly preferredCountries: readonly string[];
  readonly availability: string | null;
  readonly availableFrom: string | null;
  readonly rate: { readonly minEur: number | null; readonly maxEur: number | null };
  readonly evidenceCount: number;
  readonly experienceYears: number | null;
}

/** Shortlist preview: profile-safe + a deterministic anonymized display label. */
export interface WorkerShortlistSafePreview
  extends Omit<WorkerProfileSafePreview, "kind"> {
  readonly kind: "worker_shortlist_safe_preview";
  /** Deterministic, non-PII label for display (no name, no contact). */
  readonly anonymizedLabel: string;
}

function cleanStringList(input: readonly string[] | null | undefined): readonly string[] {
  if (!Array.isArray(input)) return [];
  return input.map((s) => (typeof s === "string" ? s.trim() : "")).filter((s) => s.length > 0);
}

function nullableString(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  const t = input.trim();
  return t.length > 0 ? t : null;
}

function nonNegativeInt(input: number | null | undefined): number {
  return typeof input === "number" && Number.isFinite(input) && input > 0 ? Math.floor(input) : 0;
}

function nullableInt(input: number | null | undefined): number | null {
  return typeof input === "number" && Number.isFinite(input) ? Math.floor(input) : null;
}

/**
 * Build the profile-safe preview by EXPLICIT allow-listing. Any contact/private
 * field on `raw` is ignored — it is never read here.
 */
export function toProfileSafePreview(raw: WorkerRecordInput): WorkerProfileSafePreview {
  return {
    kind: "worker_profile_safe_preview",
    workerId: raw.id,
    headline: nullableString(raw.headline),
    skills: cleanStringList(raw.skills),
    location: nullableString(raw.locationCountry),
    preferredCountries: cleanStringList(raw.preferredCountries),
    availability: nullableString(raw.availabilityStatus),
    availableFrom: nullableString(raw.availableFrom),
    rate: { minEur: nullableInt(raw.rateMinEur), maxEur: nullableInt(raw.rateMaxEur) },
    evidenceCount: nonNegativeInt(raw.evidenceCount),
    experienceYears: nullableInt(raw.experienceYears),
  };
}

/**
 * Deterministic anonymized label from a worker id (no name, no PII, no
 * randomness). Stable across calls so the same worker reads the same label.
 */
export function anonymizedWorkerLabel(workerId: string): string {
  const token = (workerId || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase();
  return token.length > 0 ? `Candidate ${token}` : "Candidate";
}

/** Shortlist-safe preview: profile-safe fields + anonymized label. */
export function toShortlistSafePreview(raw: WorkerRecordInput): WorkerShortlistSafePreview {
  const { kind: _omit, ...safe } = toProfileSafePreview(raw);
  void _omit;
  return {
    kind: "worker_shortlist_safe_preview",
    ...safe,
    anonymizedLabel: anonymizedWorkerLabel(raw.id),
  };
}

/** True if no output key looks like a contact / name / private identifier. */
export function isContactSafe(obj: Record<string, unknown>): boolean {
  for (const key of Object.keys(obj)) {
    const k = key.toLowerCase();
    if (FORBIDDEN_PREVIEW_KEY_PATTERNS.some((p) => k.includes(p))) return false;
  }
  return true;
}

/** Throws if a forbidden key is present. Use at any company-facing boundary. */
export function assertContactSafe(obj: Record<string, unknown>): void {
  for (const key of Object.keys(obj)) {
    const k = key.toLowerCase();
    const hit = FORBIDDEN_PREVIEW_KEY_PATTERNS.find((p) => k.includes(p));
    if (hit) {
      throw new Error(
        `worker visibility: forbidden contact/private field "${key}" in a company-facing preview`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// W4 note: the app-layer relation resolver (`resolveWorkerVisibilityRelation`
// / `canViewProfilePreview`) that used to live here was DELETED — it had no
// callers, and it documented a STRICTER rule (direct relation required) than
// the one that actually ships (`can_view_worker` in the database also allows
// consent-only discovery). Dead policy code that disagrees with the enforced
// policy is worse than no code: readers believed a control existed that never
// ran. The DB predicate is the single visibility truth; this module keeps
// only the app-layer CONTACT-safety net above.
// ---------------------------------------------------------------------------

/**
 * Owner rules 2 & 3: contact exposure is NOT available in this foundation. The
 * only future path is an explicit paid / match-purchase flow, which is NOT
 * implemented here. Always false today — no relation, no role, unlocks contact.
 */
export function canViewWorkerContact(): false {
  return false;
}

// ---------------------------------------------------------------------------
// Communication / booking eligibility (owner rule 6)
// ---------------------------------------------------------------------------

export interface WorkerAvailabilityInput {
  readonly availabilityStatus: string | null;
  readonly availableFrom: string | null;
}

/**
 * Owner rule 6: communication/booking may start only when the worker has a free
 * schedule (availability === "available") OR a concrete available-from date.
 * Deterministic; does not start any conversation — it only reports eligibility.
 */
export function canStartCommunicationOrBooking(input: WorkerAvailabilityInput): boolean {
  const freeSchedule = (input.availabilityStatus ?? "").trim().toLowerCase() === "available";
  const hasAvailableFrom =
    typeof input.availableFrom === "string" && input.availableFrom.trim().length > 0;
  return freeSchedule || hasAvailableFrom;
}
