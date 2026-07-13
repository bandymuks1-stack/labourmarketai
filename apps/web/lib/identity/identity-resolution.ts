/**
 * Identity resolution — provider-neutral PURE contract (Labour Market OS P7).
 *
 * DOCTRINE (docs/product/identity-resolution-contract-v1.md):
 *   1. Duplicate DETECTION matches ONLY on strong deterministic identifiers:
 *      exact e-mail (case-insensitive) and exact normalized phone. Name or
 *      work-history similarity can produce at most a WEAK HINT — a separate
 *      type that is structurally excluded from any merge decision and is
 *      NEVER auto-merged.
 *   2. v1 policy: A HUMAN CONFIRMS EVERY MERGE. AUTO_MERGE_ENABLED is a
 *      policy constant pinned to `false` (and guarded by
 *      lib/guards/external-profiles-consent.test.ts). Even if a future owner
 *      decision flips it, canAutoMerge additionally requires a strong
 *      deterministic match AND a recorded legal basis — never similarity.
 *   3. Merge / unmerge are EVENT RECORDS (append-only audit rows built by
 *      the builders below, written via record_identity_resolution_event_v1),
 *      never data rewrites. Original source rows are never deleted.
 *   4. Privacy: duplicate-candidate SUMMARIES never carry contact data. The
 *      DuplicateCandidate type has no email/phone field — only a MASKED hint
 *      (e.g. "same email domain"). A reviewing admin sees the match REASON,
 *      not the other profile's contact details, unless they open the
 *      admin-scoped profile view themselves (RLS-gated elsewhere).
 *
 * PURE module: no server imports, no I/O, deterministic — fully unit-tested
 * in lib/identity/identity-resolution.test.ts.
 */

/**
 * v1 POLICY CONSTANT — a human confirms every merge. Do NOT flip this
 * without an explicit owner decision + a new contract version; the consent
 * guard pins it to `false`.
 */
export const AUTO_MERGE_ENABLED = false;

/** Closed vocabulary — mirrors identity_resolution_events.matched_on. */
export const STRONG_MATCH_KINDS = [
  "strong_deterministic_id",
  "email_exact",
  "phone_exact",
] as const;
export type StrongMatchKind = (typeof STRONG_MATCH_KINDS)[number];

export const IDENTITY_EVENT_KINDS = [
  "duplicate_detected",
  "merge_confirmed",
  "merge_rejected",
  "unmerge",
] as const;
export type IdentityEventKind = (typeof IDENTITY_EVENT_KINDS)[number];

/**
 * INPUT shape for detection — this is the only place contact identifiers
 * appear, and they never leave this function inside a result object.
 */
export interface IdentityCandidateInput {
  readonly profileId: string;
  readonly email?: string | null;
  readonly phone?: string | null;
  /** Display-name — used ONLY for weak hints, never for matching. */
  readonly fullName?: string | null;
}

/**
 * A DETECTED duplicate pair. Deliberately contains NO contact fields —
 * only ids, the deterministic match kind, and a masked human-readable hint.
 */
export interface DuplicateCandidate {
  readonly primaryProfileId: string;
  readonly duplicateProfileId: string;
  readonly matchKind: StrongMatchKind;
  /** Masked reason, e.g. "same email (domain example.com)" — never the value. */
  readonly maskedHint: string;
}

/**
 * A weak similarity observation. STRUCTURALLY not a DuplicateCandidate:
 * it has no matchKind from the strong set and cannot be passed to
 * canAutoMerge or to the merge-event builder. For human context only.
 */
export interface WeakHint {
  readonly kind: "weak_hint";
  readonly primaryProfileId: string;
  readonly duplicateProfileId: string;
  readonly reason: "similar_name";
}

/** Lowercased, trimmed email or null when unusable. */
export function normalizeEmail(email: string | null | undefined): string | null {
  const v = (email ?? "").trim().toLowerCase();
  return v.includes("@") && v.length >= 5 ? v : null;
}

/**
 * Normalize a phone number for EXACT comparison: strip spaces, dots,
 * dashes, parentheses; convert leading 00 to +. Anything that does not
 * yield at least 8 digits is unusable (null) — a short fragment must never
 * produce a "match".
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  const raw = (phone ?? "").trim();
  if (!raw) return null;
  let v = raw.replace(/[\s.\-()]/g, "");
  if (v.startsWith("00")) v = `+${v.slice(2)}`;
  if (!/^\+?\d{8,15}$/.test(v)) return null;
  return v;
}

function emailDomain(normalizedEmail: string): string {
  return normalizedEmail.slice(normalizedEmail.indexOf("@") + 1);
}

/** Stable pair ordering so detection output is deterministic. */
function orderPair(a: string, b: string): [string, string] {
  return a <= b ? [a, b] : [b, a];
}

/**
 * Detect potential duplicates among the given candidates.
 *
 * Matching is EXACT-identifier-only:
 *   - same normalized email            → email_exact
 *   - same normalized phone            → phone_exact
 *   - BOTH email and phone identical   → strong_deterministic_id
 *
 * Deterministic: output is sorted by (primaryProfileId, duplicateProfileId)
 * and independent of input order. NO similarity matching happens here —
 * see detectWeakHints for the (non-mergeable) name-similarity observations.
 */
export function detectPotentialDuplicates(
  candidates: readonly IdentityCandidateInput[],
): DuplicateCandidate[] {
  const out = new Map<string, DuplicateCandidate>();

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];
      if (a.profileId === b.profileId) continue;

      const emailA = normalizeEmail(a.email);
      const emailB = normalizeEmail(b.email);
      const phoneA = normalizePhone(a.phone);
      const phoneB = normalizePhone(b.phone);

      const emailMatch = emailA !== null && emailA === emailB;
      const phoneMatch = phoneA !== null && phoneA === phoneB;
      if (!emailMatch && !phoneMatch) continue;

      const [primaryProfileId, duplicateProfileId] = orderPair(
        a.profileId,
        b.profileId,
      );
      let matchKind: StrongMatchKind;
      let maskedHint: string;
      if (emailMatch && phoneMatch) {
        matchKind = "strong_deterministic_id";
        maskedHint = `same email (domain ${emailDomain(emailA as string)}) and same phone`;
      } else if (emailMatch) {
        matchKind = "email_exact";
        maskedHint = `same email (domain ${emailDomain(emailA as string)})`;
      } else {
        matchKind = "phone_exact";
        maskedHint = "same phone number";
      }

      const key = `${primaryProfileId}|${duplicateProfileId}`;
      const existing = out.get(key);
      // strong_deterministic_id outranks a single-identifier match.
      if (!existing || matchKind === "strong_deterministic_id") {
        out.set(key, {
          primaryProfileId,
          duplicateProfileId,
          matchKind,
          maskedHint,
        });
      }
    }
  }

  return [...out.values()].sort(
    (x, y) =>
      x.primaryProfileId.localeCompare(y.primaryProfileId) ||
      x.duplicateProfileId.localeCompare(y.duplicateProfileId),
  );
}

/**
 * Name-similarity observations — NEVER matches, NEVER mergeable. Exact
 * normalized full-name equality only (anything fuzzier belongs to a human's
 * eyes, not an algorithm); returned as WeakHint so the type system keeps it
 * out of every merge path.
 */
export function detectWeakHints(
  candidates: readonly IdentityCandidateInput[],
): WeakHint[] {
  const out: WeakHint[] = [];
  const norm = (n: string | null | undefined) =>
    (n ?? "").trim().toLowerCase().replace(/\s+/g, " ");

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];
      if (a.profileId === b.profileId) continue;
      const nameA = norm(a.fullName);
      const nameB = norm(b.fullName);
      if (!nameA || nameA !== nameB) continue;
      // Skip pairs that already have a strong match — the hint adds nothing.
      const emailMatch =
        normalizeEmail(a.email) !== null &&
        normalizeEmail(a.email) === normalizeEmail(b.email);
      const phoneMatch =
        normalizePhone(a.phone) !== null &&
        normalizePhone(a.phone) === normalizePhone(b.phone);
      if (emailMatch || phoneMatch) continue;

      const [primaryProfileId, duplicateProfileId] = orderPair(
        a.profileId,
        b.profileId,
      );
      out.push({
        kind: "weak_hint",
        primaryProfileId,
        duplicateProfileId,
        reason: "similar_name",
      });
    }
  }

  return out.sort(
    (x, y) =>
      x.primaryProfileId.localeCompare(y.primaryProfileId) ||
      x.duplicateProfileId.localeCompare(y.duplicateProfileId),
  );
}

/**
 * Can this match be merged WITHOUT a human? v1 answer: NO, always
 * (AUTO_MERGE_ENABLED = false). The remaining conditions encode what a
 * future owner-approved policy would ADDITIONALLY require: a full strong
 * deterministic match AND a recorded legal basis. A WeakHint cannot even be
 * passed here — the parameter type only accepts DuplicateCandidate.
 */
export function canAutoMerge(
  match: DuplicateCandidate,
  legalBasis: string | null | undefined,
): boolean {
  if (!AUTO_MERGE_ENABLED) return false;
  return (
    match.matchKind === "strong_deterministic_id" &&
    typeof legalBasis === "string" &&
    legalBasis.trim().length > 0
  );
}

/** Payload for record_identity_resolution_event_v1 — an audit row, never a rewrite. */
export interface IdentityResolutionEventDraft {
  readonly kind: IdentityEventKind;
  readonly primaryProfileId: string;
  readonly duplicateProfileId: string;
  readonly matchedOn: StrongMatchKind | "human_decision";
  readonly legalBasis: string | null;
  readonly notes: string | null;
}

export type EventBuildResult =
  | { ok: true; event: IdentityResolutionEventDraft }
  | { ok: false; reason: "missing_human_decider" | "missing_legal_basis" | "same_profile" };

/** Detection observation — recordable without a decider (nothing merged). */
export function buildDuplicateDetectedEvent(
  match: DuplicateCandidate,
  notes?: string | null,
): EventBuildResult {
  if (match.primaryProfileId === match.duplicateProfileId) {
    return { ok: false, reason: "same_profile" };
  }
  return {
    ok: true,
    event: {
      kind: "duplicate_detected",
      primaryProfileId: match.primaryProfileId,
      duplicateProfileId: match.duplicateProfileId,
      matchedOn: match.matchKind,
      legalBasis: null,
      notes: (notes ?? "").trim() || null,
    },
  };
}

/**
 * A confirmed merge REQUIRES a human decider and a legal basis — without
 * both, no event is built (and the DB CHECK + RPC would refuse it anyway).
 * The event only RECORDS the decision; linking records to the canonical
 * person happens via talent_source_records.canonical_person_link — original
 * rows are never rewritten or deleted.
 */
export function buildMergeConfirmedEvent(args: {
  match: DuplicateCandidate;
  decidedByProfileId: string | null | undefined;
  legalBasis: string | null | undefined;
  notes?: string | null;
}): EventBuildResult {
  const { match, decidedByProfileId, legalBasis, notes } = args;
  if (match.primaryProfileId === match.duplicateProfileId) {
    return { ok: false, reason: "same_profile" };
  }
  if (!decidedByProfileId || !decidedByProfileId.trim()) {
    return { ok: false, reason: "missing_human_decider" };
  }
  if (!legalBasis || !legalBasis.trim()) {
    return { ok: false, reason: "missing_legal_basis" };
  }
  return {
    ok: true,
    event: {
      kind: "merge_confirmed",
      primaryProfileId: match.primaryProfileId,
      duplicateProfileId: match.duplicateProfileId,
      matchedOn: match.matchKind,
      legalBasis: legalBasis.trim(),
      notes: (notes ?? "").trim() || null,
    },
  };
}

/** A human rejected the pair — recorded so the same pair is not re-surfaced. */
export function buildMergeRejectedEvent(
  match: DuplicateCandidate,
  notes?: string | null,
): EventBuildResult {
  if (match.primaryProfileId === match.duplicateProfileId) {
    return { ok: false, reason: "same_profile" };
  }
  return {
    ok: true,
    event: {
      kind: "merge_rejected",
      primaryProfileId: match.primaryProfileId,
      duplicateProfileId: match.duplicateProfileId,
      matchedOn: match.matchKind,
      legalBasis: null,
      notes: (notes ?? "").trim() || null,
    },
  };
}

/**
 * Unmerge is ALWAYS possible because merges never destroyed anything:
 * original source rows still exist, so unmerging is one more audit event
 * (matched_on = human_decision) plus clearing canonical_person_link — never
 * a data reconstruction.
 */
export function buildUnmergeEvent(args: {
  primaryProfileId: string;
  duplicateProfileId: string;
  notes?: string | null;
}): EventBuildResult {
  if (args.primaryProfileId === args.duplicateProfileId) {
    return { ok: false, reason: "same_profile" };
  }
  return {
    ok: true,
    event: {
      kind: "unmerge",
      primaryProfileId: args.primaryProfileId,
      duplicateProfileId: args.duplicateProfileId,
      matchedOn: "human_decision",
      legalBasis: null,
      notes: (args.notes ?? "").trim() || null,
    },
  };
}
