/**
 * CV IMPORT PROPOSALS — the ONE pure rule both CV import doors share
 * (CV-18 / G-10, decision 0023).
 *
 * A CV text reaches the Living CV through two doors: the profile's text-first
 * flow and the conversation's CV upload. The conversation used to run the
 * section parser only, so a CV imported in the chat proposed jobs and
 * schools and never a single skill — the same text yielded skill claims on
 * one door and none on the other. Both doors now take their proposals from
 * here (through `useCvImportProposals`):
 *
 *   · SKILL CLAIMS — `extractProfileSkillClaims`, direct and indirect
 *     capabilities read from the person's own words (inference is kept);
 *   · SECTIONS — `parseCvSections`, deterministic, no AI.
 *
 * PURE: nothing is saved here. Every proposal waits for the person's own
 * per-item confirm; a claim already saved is shown as such, never offered
 * twice.
 */

import type { SuggestionStatus } from "@/components/app/detected-suggestion-card";
import { hasAnyProposal, parseCvSections, type CvSectionProposals } from "@/lib/cv/structured-parse";
import { extractProfileSkillClaims } from "@/lib/profile/skill-claim-extractor";

/** One proposed skill claim and the person's answer to it so far. */
export type CvClaimProposal = {
  readonly key: string;
  readonly status: SuggestionStatus;
  /** Normalized label — the unique key of `profile_skill_claims`. */
  readonly value: string;
  /** Human form shown on the chip. */
  readonly label: string;
  /** True when the claim came from the optional AI structuring run; it then
   *  carries an explicit AI hint and goes through the same confirm. */
  readonly aiOrigin?: boolean;
};

export type CvImportProposals =
  | {
      readonly status: "ok";
      readonly claims: CvClaimProposal[];
      readonly sections: CvSectionProposals | null;
    }
  /** The skill reading threw: no claims, the sections still stand. */
  | {
      readonly status: "extract_failed";
      readonly claims: CvClaimProposal[];
      readonly sections: CvSectionProposals | null;
    };

function sectionsOf(raw: string): CvSectionProposals | null {
  try {
    return parseCvSections(raw);
  } catch (e) {
    console.error("[cv-import] section parse failed:", e);
    return null;
  }
}

export function proposeFromCvText(raw: string, savedClaimSet: ReadonlySet<string>): CvImportProposals {
  const sections = sectionsOf(raw);
  let extracted: ReturnType<typeof extractProfileSkillClaims>;
  try {
    extracted = extractProfileSkillClaims(raw);
  } catch (e) {
    console.error("[cv-import] skill extraction failed:", e);
    return { status: "extract_failed", claims: [], sections };
  }
  return {
    status: "ok",
    sections,
    claims: extracted.map((c, i) => ({
      key: `claim-${i}-${c.normalizedLabel}`,
      status: savedClaimSet.has(c.normalizedLabel) ? "already_saved" : "pending",
      value: c.normalizedLabel,
      label: c.label,
    })),
  };
}

/** The optional AI run's extra labels, appended as ordinary pending claims
 *  (deduplicated against what is already proposed or saved). */
export function appendAiClaims(
  prev: readonly CvClaimProposal[],
  aiLabels: readonly string[],
  savedClaimSet: ReadonlySet<string>,
): CvClaimProposal[] {
  const seen = new Set(prev.map((it) => it.value));
  const extras: CvClaimProposal[] = [];
  for (const [i, label] of aiLabels.entries()) {
    const norm = label.trim().toLowerCase();
    if (!norm || seen.has(norm) || savedClaimSet.has(norm)) continue;
    seen.add(norm);
    extras.push({ key: `ai-${i}-${norm}`, status: "pending", value: norm, label: label.trim(), aiOrigin: true });
  }
  return extras.length > 0 ? [...prev, ...extras] : [...prev];
}

/** Anything for the person to review: a claim or a structured section. */
export function hasAnyCvImportProposal(p: Pick<CvImportProposals, "claims" | "sections">): boolean {
  return p.claims.length > 0 || (p.sections !== null && hasAnyProposal(p.sections));
}

/** The labels the person confirmed, ready for the one save action. */
export function confirmedClaimLabels(claims: readonly CvClaimProposal[]): string[] {
  return claims
    .filter((it) => it.status === "confirmed")
    .map((it) => it.label.trim())
    .filter((l) => l.length > 0);
}
