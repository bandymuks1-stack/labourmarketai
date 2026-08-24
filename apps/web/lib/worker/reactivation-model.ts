/**
 * REGISTERED-USER REACTIVATION — pure candidate deriver (value train, §10).
 *
 * The reactivation funnel (owner master order §10):
 *   REGISTERED → PROFILE CHECK → STALE/MISSING SIGNAL → PERSONALIZED NUDGE →
 *   RETURN → UPDATE → JOURNAL → FRESH MATCHING → OPPORTUNITY.
 * This module is the decision core of the first three steps: given who is away
 * (a real ACCOUNT-ACTIVITY bucket) and what is REALLY true for them (the
 * already-derived `WeeklyPersonalIntelligence`), it decides whether the worker
 * is worth a reactivation nudge and, if so, carries only HONEST signals for the
 * copy layer to localize.
 *
 * THE AUDIENCE SIGNAL (binding). `bucket` MUST come from real account activity
 * — last session / sign-in (e.g. `auth.users.last_sign_in_at`, read by the
 * service-role dispatcher). It must NOT be the `lib/scouting/profile-freshness`
 * bucket: that reads `workers.updated_at` (profile-EDIT recency), an
 * employer-discovery signal — a frequent visitor who has not edited their
 * profile would read "dormant" and be nudged wrongly, and a recent edit would
 * suppress a genuinely-absent account. The type is a plain active/recent/
 * dormant vocabulary; the SOURCE is what must be an activity signal.
 *
 * It creates no second matching engine and no second journal read — the "what
 * is true" half composes the canonical `lib/worker/weekly-intelligence-model`.
 * Delivery is NOT here: a nudge rides the existing notification spine
 * (`lib/notifications/weekly-digest-emitter` pattern) once consent + a channel
 * exist; this module only decides the payload.
 *
 * HONESTY RULES (binding, tested):
 *  - `active` accounts are NEVER a reactivation audience — the weekly digest is
 *    theirs; reactivation targets the away band (`recent`/`dormant`).
 *  - Every reason is backed by a REAL weekly signal. `opportunityCount` is
 *    copied straight from the `matching_opportunities` signal — never invented,
 *    never a manufactured "come back" number.
 *  - A stale profile with nothing real to say is NOT a candidate — no spam. If
 *    the board read was unavailable we decline with that reason rather than
 *    claim a count we do not have.
 *
 * Pure. No IO, no env, no server-only. Types only from other pure modules.
 */
import type {
  WeeklyPersonalIntelligence,
  WeeklyMatchExemplar,
} from "./weekly-intelligence-model";

/**
 * How recently the ACCOUNT was actually active (last session / sign-in) —
 * NOT profile-edit recency. Deliberately a local vocabulary, not the
 * `profile-freshness` `LastActiveBucket`, so a caller cannot accidentally feed
 * the employer-discovery signal (see the module docblock).
 */
export type ActivityBucket = "active" | "recent" | "dormant";

/** Honest, codes-only reasons a worker is worth a reactivation nudge. */
export type ReactivationReason =
  /** Real recommendable matches exist for them right now. */
  | "opportunities_waiting"
  /** Demands appeared in the trailing 7 days (a market fact, not "new for you"). */
  | "fresh_market_activity"
  /** Their current top matches have skill gaps their recent work could fill. */
  | "evidence_to_add";

/** Honest reasons a worker is NOT nudged (never silently dropped). */
export type ReactivationDecline =
  /** Touched recently — covered by the weekly digest, not reactivation. */
  | "profile_active"
  /** The board read degraded — we cannot claim any opportunity number. */
  | "opportunities_unavailable"
  /** Away, but nothing real to pull them back with — never manufacture one. */
  | "no_real_pull";

export type ReactivationSignal =
  | { readonly code: "not_a_candidate"; readonly decline: ReactivationDecline }
  | {
      readonly code: "reactivation_candidate";
      /** Only the away band reaches here — never "active". */
      readonly bucket: Exclude<ActivityBucket, "active">;
      /** At least one; the copy layer localizes each. */
      readonly reasons: readonly ReactivationReason[];
      /**
       * Real recommendable-match count, copied verbatim from the weekly
       * `matching_opportunities` signal. 0 only when the pull comes solely from
       * fresh-market/evidence reasons (then `opportunities_waiting` is absent).
       */
      readonly opportunityCount: number;
      /**
       * True when the board read returned its full page, so `opportunityCount`
       * is a LOWER BOUND (`intelligence.opportunities.boardTruncated`). The copy
       * layer must then render it as "N+" — never "exactly N" (§19 no silent
       * caps). Always false when `opportunityCount` is 0.
       */
      readonly opportunityCountIsLowerBound: boolean;
      /** The best concrete match WITH its §19 basis, or null. */
      readonly exemplar: WeeklyMatchExemplar | null;
    };

/**
 * Decide whether a registered worker is a reactivation candidate, and with what
 * honest signals. Composes the account-activity bucket (who is away) with the already
 * derived weekly intelligence (what is really true). No IO; no fabricated
 * numbers — every reason is backed by a real weekly signal.
 */
export function deriveReactivationSignal(
  bucket: ActivityBucket,
  intelligence: WeeklyPersonalIntelligence,
): ReactivationSignal {
  // Active users are not a reactivation audience — the weekly digest is theirs.
  if (bucket === "active") {
    return { code: "not_a_candidate", decline: "profile_active" };
  }

  const signals = intelligence.signals;
  const opp = signals.find((s) => s.code === "matching_opportunities");
  const oppUnavailable = signals.some(
    (s) => s.code === "opportunities_unavailable",
  );
  const appeared = signals.find((s) => s.code === "appeared_this_week");
  const missing = signals.find((s) => s.code === "missing_evidence");

  const reasons: ReactivationReason[] = [];
  let opportunityCount = 0;
  let exemplar: WeeklyMatchExemplar | null = null;

  if (opp && opp.code === "matching_opportunities" && opp.count > 0) {
    reasons.push("opportunities_waiting");
    opportunityCount = opp.count; // real count, never invented
    exemplar = opp.exemplar;
  }
  if (appeared && appeared.code === "appeared_this_week" && appeared.count > 0) {
    reasons.push("fresh_market_activity");
  }
  if (
    missing &&
    missing.code === "missing_evidence" &&
    missing.skillSlugs.length > 0
  ) {
    reasons.push("evidence_to_add");
  }

  if (reasons.length === 0) {
    // Away, but nothing real to say. Decline honestly — never spam. When the
    // board read itself was unavailable, name that rather than "no pull".
    return {
      code: "not_a_candidate",
      decline: oppUnavailable ? "opportunities_unavailable" : "no_real_pull",
    };
  }

  return {
    code: "reactivation_candidate",
    bucket, // "recent" | "dormant" — "active" already returned above
    reasons,
    opportunityCount,
    // Preserve the board's lower-bound state so the copy layer renders "N+"
    // rather than an exact count when the read was truncated (§19).
    opportunityCountIsLowerBound:
      opportunityCount > 0 && intelligence.opportunities.boardTruncated === true,
    exemplar,
  };
}
