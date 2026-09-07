/**
 * FIVE YEARS OF REAL WORK IS NOT "CERTIFICATE MISSING".
 * (Owner correction, 2026-09-07: "REAL EXPERIENCE MUST HAVE ECONOMIC VALUE".)
 *
 * ── THE CONTRADICTION THIS RESOLVES ────────────────────────────────────────
 * `READINESS_ITEM_DOCUMENT_TYPES.qualification_or_skill_evidence` maps to
 * exactly two document types — `professional_certificate` and
 * `health_safety_card`. So the product's whole answer to "does this person
 * have qualification or SKILL EVIDENCE?" was *certificate present* or
 * *certificate missing*. A person with years of confirmed, independently
 * verified work and no paper read identically to a person with nothing at all.
 *
 * Note the row's own name: it already promises to accept **skill evidence**.
 * The map simply never did.
 *
 * ── THE FIVE CONCEPTS, KEPT APART ──────────────────────────────────────────
 * The owner names five things that must not collapse into each other:
 *
 *   DEMONSTRATED CAPABILITY   real work, independently confirmed
 *   FORMAL QUALIFICATION      a credential a body issued
 *   RECOGNIZED EQUIVALENCE    prior learning assessed as equivalent (RPL)
 *   VALID CREDENTIAL          a formal qualification still in date
 *   MISSING FORMAL REQUIREMENT what is still legally or contractually required
 *
 * The load-bearing rule is the one it would be easiest to get wrong in the
 * generous direction: **demonstrated capability never satisfies a formal
 * requirement.** A welding certificate required on a site is required; no
 * amount of recorded welding replaces it, and a product that implied
 * otherwise would put someone on a site they may not lawfully be on.
 *
 * What demonstrated capability DOES do is stop being invisible, and open the
 * route that can actually close the gap: recognition of prior learning, or
 * targeted training aimed at exactly what is missing rather than at a course
 * someone has already outgrown.
 *
 * ── NOTHING HERE INVENTS EVIDENCE ──────────────────────────────────────────
 * Every input is a recorded fact counted elsewhere: independently confirmed
 * journal entries, verified worker skills, and the person's own document
 * records. A self-confirmation is NOT independent confirmation and is counted
 * separately, exactly as `countsAsIndependentlyVerified` and
 * `deriveIndependentReviewResult` decided for every other surface. Unknown is
 * a distinct answer from zero throughout.
 *
 * Pure: no IO, no dates invented, no thresholds tuned to make a number look
 * better.
 */

/** What the person has, for one capability requirement. Ordered weakest to
 *  strongest — the order the derivation resolves in reverse. */
export const CAPABILITY_STANDINGS = [
  /** Nothing is recorded either way. Not a judgement about the person. */
  "no_evidence",
  /** The read that would answer this did not answer. Never rendered as "no". */
  "unknown",
  /** Real recorded work, none of it confirmed by anyone else. Legitimate, and
   *  legitimately weaker than confirmed work. */
  "self_reported_capability",
  /** Real work that someone other than the person confirmed. This is the
   *  concept the product had no name for. */
  "demonstrated_capability",
  /** Prior learning formally assessed as equivalent to a qualification. */
  "recognized_equivalence",
  /** A credential exists and is in date. */
  "valid_credential",
] as const;

export type CapabilityStanding = (typeof CAPABILITY_STANDINGS)[number];

/** The honest route from where the person is to where the requirement is. */
export type RecognitionRoute =
  /** Nothing is missing. */
  | "none"
  /** Record the credential they already hold. */
  | "record_credential"
  /** Renew a credential that is running out. */
  | "renew_credential"
  /** Real work exists: have it assessed against the requirement (RPL). */
  | "prior_learning_review"
  /** Real work exists but nobody has confirmed it — confirmation first. */
  | "seek_confirmation"
  /** Neither paper nor recorded work: training is the honest route. */
  | "training";

/** The recorded facts this derivation is allowed to look at. Every field is
 *  three-valued where it can be: `null` means the read did not answer, which
 *  is never the same as zero. */
export interface CapabilityEvidence {
  /** Journal entries about this kind of work that SOMEONE ELSE confirmed. */
  readonly independentlyConfirmedEntries: number | null;
  /** Recorded entries about this work, confirmed or not. */
  readonly recordedEntries: number | null;
  /** Worker skills carrying `verified` — set by a real confirmation only. */
  readonly verifiedSkills: number | null;
  /** A recorded, in-date credential answering the requirement. */
  readonly hasValidCredential: boolean;
  /** A recorded credential that is running out. */
  readonly hasExpiringCredential: boolean;
  /** A formal recognition-of-prior-learning decision already exists. */
  readonly hasRecognizedEquivalence: boolean;
}

export interface CapabilityAssessment {
  readonly standing: CapabilityStanding;
  /**
   * Is the FORMAL requirement satisfied? True only for a credential or an
   * assessed equivalence — never for demonstrated capability, however much of
   * it there is. This is the field a deployment decision may read.
   */
  readonly formalRequirementMet: boolean;
  /** The one honest next step. */
  readonly route: RecognitionRoute;
  /**
   * True when real work exists that the formal answer does not capture. The
   * whole point: an employer and the person should both be able to SEE that
   * five years of work is there, even while the certificate is still required.
   */
  readonly hasUncountedRealWork: boolean;
}

/** Did any read answer at all? */
function answered(e: CapabilityEvidence): boolean {
  return (
    e.independentlyConfirmedEntries !== null ||
    e.recordedEntries !== null ||
    e.verifiedSkills !== null ||
    e.hasValidCredential ||
    e.hasExpiringCredential ||
    e.hasRecognizedEquivalence
  );
}

/**
 * Assess one capability requirement against what is actually recorded.
 *
 * `formalRequirementRequired` says whether a credential is genuinely demanded
 * here. When it is not, demonstrated capability is a complete answer and the
 * route is `none` — the model must not manufacture a gap where the project
 * never asked for paper.
 */
export function assessCapability(
  evidence: CapabilityEvidence,
  opts: { readonly formalRequirementRequired: boolean } = { formalRequirementRequired: true },
): CapabilityAssessment {
  const confirmed = evidence.independentlyConfirmedEntries ?? 0;
  const verified = evidence.verifiedSkills ?? 0;
  const recorded = evidence.recordedEntries ?? 0;
  const realWork = confirmed > 0 || verified > 0 || recorded > 0;

  // 1. A valid credential answers the formal question completely.
  if (evidence.hasValidCredential) {
    return {
      standing: "valid_credential",
      formalRequirementMet: true,
      route: "none",
      hasUncountedRealWork: false,
    };
  }

  // 2. An assessed equivalence is a formal answer too — that is what RPL IS.
  if (evidence.hasRecognizedEquivalence) {
    return {
      standing: "recognized_equivalence",
      formalRequirementMet: true,
      route: "none",
      hasUncountedRealWork: false,
    };
  }

  // 3. A credential running out is still valid TODAY, and still a deadline.
  if (evidence.hasExpiringCredential) {
    return {
      standing: "valid_credential",
      formalRequirementMet: true,
      route: "renew_credential",
      hasUncountedRealWork: realWork,
    };
  }

  // 4. Nothing answered — UNKNOWN, which is not "nothing".
  if (!answered(evidence)) {
    return {
      standing: "unknown",
      formalRequirementMet: false,
      route: opts.formalRequirementRequired ? "record_credential" : "none",
      hasUncountedRealWork: false,
    };
  }

  // 5. Real work, confirmed by someone else. THE case this model exists for.
  if (confirmed > 0 || verified > 0) {
    return {
      standing: "demonstrated_capability",
      // Never true. A required certificate is required; recorded work does
      // not make someone lawfully deployable without it.
      formalRequirementMet: false,
      route: opts.formalRequirementRequired ? "prior_learning_review" : "none",
      hasUncountedRealWork: opts.formalRequirementRequired,
    };
  }

  // 6. Real work nobody has confirmed. Legitimate, and the first step is
  //    getting it confirmed — not being sent on a course.
  if (recorded > 0) {
    return {
      standing: "self_reported_capability",
      formalRequirementMet: false,
      route: opts.formalRequirementRequired ? "seek_confirmation" : "none",
      hasUncountedRealWork: opts.formalRequirementRequired,
    };
  }

  // 7. Genuinely nothing recorded either way.
  return {
    standing: "no_evidence",
    formalRequirementMet: false,
    route: opts.formalRequirementRequired ? "training" : "none",
    hasUncountedRealWork: false,
  };
}

/** Does this standing represent real work the person actually did? Used by
 *  surfaces that must show capability alongside a formal gap rather than
 *  instead of it. */
export function isRealWorkStanding(standing: CapabilityStanding): boolean {
  return standing === "demonstrated_capability" || standing === "self_reported_capability";
}
