/**
 * INTERNSHIP NEXT STEPS (window 6, gap G-C2) — the PURE decision.
 *
 * ── THE DEFECT THIS EXISTS TO FIX ──────────────────────────────────────────
 * Prod walk 2026-09-05: a student asked "kur galiu atlikti praktiką?" and got
 * "Supratau „praktiką", bet ten dabar tau nieko nematoma." — honest (zero
 * internship-type needs are visible; in production no need has ever carried
 * an opportunity type) but a DEAD END: no chip, no next step, nothing about
 * the institution the student studies with.
 *
 * ── WHAT THIS MODULE IS ────────────────────────────────────────────────────
 * Given three facts the caller already reads (the compass' profession, the
 * student's institution engagement, the compass' own next steps) it decides
 * which of the EXISTING doors to offer. It invents no opportunity, no
 * institution and no vocabulary: every chip id is one the conversation
 * already handles (`profile`, `compass-page`, `jobs`, `logwork`), every line
 * is a `workspace.ai` key. No IO.
 *
 * ── THE RULES ──────────────────────────────────────────────────────────────
 * 1. No profession → the FIRST step is to choose a direction (the compass'
 *    own `choose_direction` step): the internship search cannot narrow to a
 *    trade it does not know.
 * 2. A named institution → "ask your institution": the institution sees the
 *    programme's market demand line and can bring a partner employer to post
 *    an internship need. Never said when the student has no institution.
 * 3. Always the compass (what fits now, what is missing) and the unfiltered
 *    board — an internship is a subset of one board, never a second engine.
 * Chips are capped at three, in that order, de-duplicated.
 */

export type InternshipLineKey =
  | "internshipChooseDirection"
  | "internshipAskInstitution"
  | "internshipCompass";

export interface InternshipNextStepsInput {
  /** `becoming.professionSlug` of the compass, or the worker's profession. */
  readonly professionSlug: string | null;
  /** The organisation of the caller's ACTIVE `student` engagement, if any. */
  readonly institutionName: string | null;
}

export interface InternshipNextStepChip {
  /** An EXISTING conversation chip id. */
  readonly id: "profile" | "compass-page" | "jobs";
  /** A `workspace.ai` key for the chip label. */
  readonly labelKey: "chipChooseDirection" | "chipCompassPage" | "chipAllOpportunities";
}

export interface InternshipNextSteps {
  readonly lines: readonly { readonly key: InternshipLineKey; readonly institution?: string }[];
  readonly chips: readonly InternshipNextStepChip[];
}

export const INTERNSHIP_CHIP_CAP = 3;

export function internshipNextSteps(input: InternshipNextStepsInput): InternshipNextSteps {
  const lines: { key: InternshipLineKey; institution?: string }[] = [];
  const chips: InternshipNextStepChip[] = [];
  const hasProfession = typeof input.professionSlug === "string" && input.professionSlug.length > 0;
  const institution = (input.institutionName ?? "").trim();

  if (!hasProfession) {
    lines.push({ key: "internshipChooseDirection" });
    chips.push({ id: "profile", labelKey: "chipChooseDirection" });
  }
  if (institution.length > 0) {
    lines.push({ key: "internshipAskInstitution", institution });
  }
  lines.push({ key: "internshipCompass" });
  chips.push({ id: "compass-page", labelKey: "chipCompassPage" });
  chips.push({ id: "jobs", labelKey: "chipAllOpportunities" });

  const seen = new Set<string>();
  const unique = chips.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
  return { lines, chips: unique.slice(0, INTERNSHIP_CHIP_CAP) };
}
