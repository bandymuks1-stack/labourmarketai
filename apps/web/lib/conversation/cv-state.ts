/**
 * WHAT THE PRODUCT ACTUALLY HOLDS AS THIS PERSON'S CV — classified for the
 * conversation. PURE: no server-only import, no IO, no env.
 *
 * ── Why this module exists ────────────────────────────────────────────────
 * The chat's `cv-view` handler used to answer "Here is your CV — what the
 * system knows about you today" as a CONSTANT. It read nothing. So the one
 * sentence a person is most likely to type about their own history —
 * "Noriu pamatyti savo CV" — was answered with a claim the product had not
 * checked, and when the person had no CV the claim was simply false. Worse,
 * the handler was gated on the ACTIVE WORKSPACE being `person`, so the same
 * human sitting in their company workspace fell through to the generic
 * fallback, whose chips offer to UPLOAD a CV they already have.
 *
 * That is the shape of the defect the owner walked into: the product offers
 * to CREATE what it has never checked whether it already HAS.
 *
 * ── The rule this module encodes ──────────────────────────────────────────
 * READ THE EXISTING STATE BEFORE OFFERING TO CREATE IT.
 *
 * And it keeps SEP-7 (UNKNOWN != ZERO != FAILED != NOT_MEASURED) intact: a
 * read that FAILED is `unreadable`, never `empty`. Rendering a failed read as
 * an empty record is the defect class the 2026-09-09 honesty sweep closed
 * elsewhere in this product (#1650/#1651/#1652); it may not be re-introduced
 * here. `empty` is a claim about the PERSON. `unreadable` is a statement
 * about US.
 *
 * The counts below are FACTS read from the canonical CV reader
 * (`lib/cv-export/verified-cv.ts` — the same builder the printed CV renders
 * from). This module never re-derives CV content and never queries: one CV
 * truth, one reader.
 */
import type { VerifiedCvResult } from "@/lib/cv-export/verified-cv";

/**
 * `unreadable`    the read failed — say so, never call it empty (SEP-7)
 * `unauthenticated` no session
 * `not_a_worker`  authenticated, but no `workers` row exists yet
 * `empty`         a worker record exists and genuinely holds nothing
 * `started`       real content, but no work history and no confirmed proof
 * `substantive`   real work history or confirmed proof exists
 */
export type CvPresence =
  | "unreadable"
  | "unauthenticated"
  | "not_a_worker"
  | "empty"
  | "started"
  | "substantive";

export type CvState = {
  readonly presence: CvPresence;
  readonly workHistory: number;
  readonly skills: number;
  /** Skills carrying a REAL verified flag — never inferred from a tier label. */
  readonly confirmedSkills: number;
  readonly confirmedProof: number;
  readonly education: number;
  readonly certificates: number;
  readonly languages: number;
  /** True when the person wrote their own professional summary. */
  readonly hasSummary: boolean;
};

const ZERO = {
  workHistory: 0,
  skills: 0,
  confirmedSkills: 0,
  confirmedProof: 0,
  education: 0,
  certificates: 0,
  languages: 0,
  hasSummary: false,
} as const;

export const CV_STATE_UNREADABLE: CvState = { presence: "unreadable", ...ZERO };

/** Does this state describe a CV that exists and has something in it? */
export function cvHasContent(state: CvState): boolean {
  return state.presence === "started" || state.presence === "substantive";
}

/**
 * Classify the canonical reader's result. The ONLY place the conversation
 * decides what "I have a CV" means.
 */
export function classifyCvState(result: VerifiedCvResult): CvState {
  if (!result.ok) {
    return {
      presence: result.code === "not_authenticated" ? "unauthenticated" : "not_a_worker",
      ...ZERO,
    };
  }
  const cv = result.cv;
  const counts = {
    workHistory: cv.workHistory.length,
    // Declared free-label claims are skills the person stated; catalogued
    // skill facts are the rows the CV groups into tiers. Both are things the
    // CV shows, so both count towards "there is something here" — but only
    // `verified === true` may be called confirmed (SEP-3).
    skills: cv.skillFacts.length + cv.declaredClaims.length,
    confirmedSkills: cv.skillFacts.filter((s) => s.verified).length,
    confirmedProof: cv.proof.length,
    education: cv.education.length,
    certificates: cv.certificateDocs.length + cv.declaredCertificates.length,
    languages: cv.languages.length,
    hasSummary: Boolean(cv.professionalSummary && cv.professionalSummary.trim().length > 0),
  };

  // WORK HISTORY or CONFIRMED PROOF is what makes a CV worth showing an
  // employer. Everything else is real, and is counted, but on its own it is a
  // CV that has been STARTED — the honest word for it, and a different next
  // action from both "empty" and "here it is".
  const substantive = counts.workHistory > 0 || counts.confirmedProof > 0;
  const anything =
    substantive ||
    counts.skills > 0 ||
    counts.education > 0 ||
    counts.certificates > 0 ||
    counts.languages > 0 ||
    counts.hasSummary;

  return {
    presence: substantive ? "substantive" : anything ? "started" : "empty",
    ...counts,
  };
}
