/**
 * FORMAL REQUIREMENTS of a need, kept APART from skill fit (PURE).
 *
 * Owner decision 2026-10-29, point 5: keep apart demonstrated skills,
 * probable matches and mandatory formal qualifications; experience never
 * automatically replaces a legally required certificate or licence (SEP-6:
 * demonstrated capability ≠ formal qualification ≠ recognised equivalence ≠
 * valid credential ≠ missing requirement).
 *
 * The skill layer already separates the first two (match-v1: journal-
 * supported / manager-confirmed / self-declared tiers, and the
 * "recognized — not confirmed" flag on a derived requirement set). This is
 * the third layer. It is STRUCTURALLY unable to be satisfied by work: its
 * input has no skills, no journal entries and no hours — only what the need
 * formally asks for and what the person formally STATED they hold. A
 * recognised equivalence is an assessor's act (lib/skills/recognition-model.ts,
 * SKL-9 — an owner decision) and is not read here, so nothing on this layer
 * can turn green from recorded work.
 */

import { isOftenRegulatedProfession } from "@/lib/collaboration/collaboration-checks";
import type { StructuredDemandV2 } from "@/lib/demand/structured-demand-v2";

export type FormalRequirement =
  /** The need states driving-licence categories (structured v2, closed set). */
  | {
      readonly kind: "driving_licence";
      readonly categories: readonly string[];
      /** `stated_held` = the person's OWN statement covers every category
       *  (workers.driving_licence_categories) — a statement, not a verified
       *  credential; `missing_requirement` = not stated, or not covered. */
      readonly standing: "stated_held" | "missing_requirement";
    }
  /** The need's profession is commonly regulated (a licence or registered
   *  qualification may be legally required, depending on the country). */
  | {
      readonly kind: "professional_qualification";
      readonly professionSlug: string;
      readonly standing: "missing_requirement";
    };

export interface FormalRequirementInput {
  readonly structuredV2: StructuredDemandV2 | null | undefined;
  /** The need's profession (stated or detected from the need's own words). */
  readonly professionSlug: string | null | undefined;
  /** What the PERSON stated they hold — never derived from their work. */
  readonly statedLicenceCategories: readonly string[] | null | undefined;
}

export function formalRequirementsFor(input: FormalRequirementInput): readonly FormalRequirement[] {
  const out: FormalRequirement[] = [];
  const required = [...new Set((input.structuredV2?.transport?.licence_categories ?? []).map((c) => c.trim().toUpperCase()))]
    .filter((c) => c !== "")
    .sort();
  if (required.length > 0) {
    const held = new Set((input.statedLicenceCategories ?? []).map((c) => c.trim().toUpperCase()));
    out.push({
      kind: "driving_licence",
      categories: required,
      standing: required.every((c) => held.has(c)) ? "stated_held" : "missing_requirement",
    });
  }
  const profession = (input.professionSlug ?? "").trim();
  if (profession && isOftenRegulatedProfession(profession)) {
    out.push({ kind: "professional_qualification", professionSlug: profession, standing: "missing_requirement" });
  }
  return out;
}
