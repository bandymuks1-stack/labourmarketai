/**
 * LEARNING COMPASS — pure model (Track C, FIRST REAL ECOSYSTEM USE 2026-09-03).
 *
 * The student home answers five questions from REAL evidence only:
 *   1. Who am I professionally becoming?   → primary profession + current education
 *   2. What skills / evidence do I have?   → own skills by evidence tier, journal, education
 *   3. What opportunities fit me now?      → the SAME deterministic board the worker sees
 *   4. What am I missing?                  → the match engine's own `missingSkillSlugs`
 *                                            over those opportunities; when there are
 *                                            no opportunities yet, the profession's
 *                                            registry skills the person has not declared
 *   5. What should I learn / do next?      → deterministic next steps derived from 1–4
 *
 * Nothing here is generated, scored or ranked by a model. Every line traces to
 * a row the person owns or to the explainable match engine (docs §7: no fake
 * AI, no fake verification). When a question has no evidence, the answer is
 * an honest "nothing yet", never a placeholder.
 */

import type { EvidenceTier } from "@/lib/evidence/evidence-tier";
import { skillsForProfession } from "@/lib/taxonomy/profession-skills";

export interface CompassSkill {
  readonly slug: string;
  readonly evidence: EvidenceTier;
}

export interface CompassEducation {
  readonly institutionName: string;
  readonly programOrField: string | null;
  readonly educationTypeSlug: string;
  readonly isCurrent: boolean;
}

export interface CompassOpportunity {
  readonly requestId: string;
  readonly roleSlug: string | null;
  readonly companyName: string | null;
  readonly country: string | null;
  readonly status: "strong" | "possible" | "weak" | "insufficient_data";
  readonly matchedSkillSlugs: readonly string[];
  readonly missingSkillSlugs: readonly string[];
}

export interface CompassInput {
  readonly professionSlug: string | null;
  readonly skills: readonly CompassSkill[];
  readonly journalEntryCount: number;
  readonly education: readonly CompassEducation[];
  readonly opportunities: readonly CompassOpportunity[];
  readonly availabilityKnown: boolean;
}

export type CompassMissingSource = "opportunities" | "profession";

export interface CompassMissingSkill {
  readonly slug: string;
  /** How many of the shown opportunities ask for it (0 when source=profession). */
  readonly askedBy: number;
}

export type CompassNextStep =
  | "choose_direction" // no profession yet
  | "declare_skills" // no skills at all
  | "log_first_entry" // journal empty
  | "add_current_education" // student flag without a current education row
  | "gain_evidence_for_missing" // there are missing skills to work on
  | "set_availability" // availability unknown blocks matching
  | "express_interest"; // a strong/possible fit is waiting

export interface LearningCompass {
  readonly becoming: {
    readonly professionSlug: string | null;
    readonly currentEducation: CompassEducation | null;
  };
  readonly evidence: {
    readonly skillsTotal: number;
    readonly skillsConfirmed: number;
    readonly skillsJournalSupported: number;
    readonly skillsSelfDeclared: number;
    readonly journalEntries: number;
    readonly educationEntries: number;
  };
  readonly fitsNow: readonly CompassOpportunity[];
  readonly missing: {
    readonly source: CompassMissingSource | null;
    readonly skills: readonly CompassMissingSkill[];
  };
  readonly nextSteps: readonly CompassNextStep[];
}

const MAX_FITS = 3;
const MAX_MISSING = 5;

function tierIs(tier: EvidenceTier, ...names: string[]): boolean {
  return names.includes(String(tier));
}

export function buildLearningCompass(input: CompassInput): LearningCompass {
  const currentEducation = input.education.find((e) => e.isCurrent) ?? null;
  const ownSlugs = new Set(input.skills.map((s) => s.slug));

  // EvidenceTier = "manager_confirmed" | "work_journal" | "self_declared"
  const skillsConfirmed = input.skills.filter((s) => tierIs(s.evidence, "manager_confirmed")).length;
  const skillsJournalSupported = input.skills.filter((s) => tierIs(s.evidence, "work_journal")).length;
  const skillsSelfDeclared = input.skills.length - skillsConfirmed - skillsJournalSupported;

  // 3. What fits now — the board's own order (strong first), never re-ranked here.
  const order = { strong: 0, possible: 1, weak: 2, insufficient_data: 3 } as const;
  const fitsNow = [...input.opportunities]
    .sort((a, b) => order[a.status] - order[b.status])
    .filter((o) => o.status === "strong" || o.status === "possible")
    .slice(0, MAX_FITS);

  // 4. What is missing — counted across the opportunities the engine showed;
  //    with no opportunities, the profession registry minus what is declared.
  let missingSource: CompassMissingSource | null = null;
  let missing: CompassMissingSkill[] = [];
  const asked = new Map<string, number>();
  for (const o of input.opportunities) {
    for (const slug of o.missingSkillSlugs) {
      if (ownSlugs.has(slug)) continue;
      asked.set(slug, (asked.get(slug) ?? 0) + 1);
    }
  }
  if (asked.size > 0) {
    missingSource = "opportunities";
    missing = [...asked.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, MAX_MISSING)
      .map(([slug, askedBy]) => ({ slug, askedBy }));
  } else if (input.professionSlug) {
    const registry = skillsForProfession(input.professionSlug).filter((s) => !ownSlugs.has(s));
    if (registry.length > 0) {
      missingSource = "profession";
      missing = registry.slice(0, MAX_MISSING).map((slug) => ({ slug, askedBy: 0 }));
    }
  }

  // 5. Next steps — deterministic, in the order that unblocks the most.
  const next: CompassNextStep[] = [];
  if (!input.professionSlug) next.push("choose_direction");
  if (input.skills.length === 0) next.push("declare_skills");
  if (!currentEducation && input.education.length === 0) next.push("add_current_education");
  if (input.journalEntryCount === 0) next.push("log_first_entry");
  if (!input.availabilityKnown && input.professionSlug) next.push("set_availability");
  if (fitsNow.length > 0) next.push("express_interest");
  if (missing.length > 0) next.push("gain_evidence_for_missing");

  return {
    becoming: { professionSlug: input.professionSlug, currentEducation },
    evidence: {
      skillsTotal: input.skills.length,
      skillsConfirmed,
      skillsJournalSupported,
      skillsSelfDeclared,
      journalEntries: input.journalEntryCount,
      educationEntries: input.education.length,
    },
    fitsNow,
    missing: { source: missingSource, skills: missing },
    nextSteps: next,
  };
}

/** A person is on the student path when they hold a CURRENT education row or
 *  an active learner link. Pure; both inputs are already RLS-scoped reads. */
export function isStudentPath(input: {
  readonly education: readonly CompassEducation[];
  readonly hasLearnerLink: boolean;
}): boolean {
  return input.hasLearnerLink || input.education.some((e) => e.isCurrent);
}
