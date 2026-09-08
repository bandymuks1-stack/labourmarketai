/**
 * EDUCATION-SHAPED HOME (M10) — which starters the company workspace offers.
 *
 * ── THE DEFECT THIS EXISTS TO FIX ──────────────────────────────────────────
 * The chat-first home has exactly TWO base identities (person/company —
 * systemic-ux-roles-v1, an owner decision this module works WITHIN, never
 * around). An education institution is an organization with the
 * `training_provider` capability, so it lands in the company workspace — and
 * until M10 it was greeted with "I need workers", candidates and projects:
 * employer copy for an organization that never declared it employs anyone.
 *
 * ── WHAT THIS MODULE IS ────────────────────────────────────────────────────
 * The pure decision only. It answers "should the company-workspace greeting
 * offer education-shaped starts?" from the SAME capability read layer the
 * invite panel and the company hub already use (`lib/organizations/
 * capabilities.ts` over `organization_roles` + the legacy column fallback).
 * No IO, no new vocabulary, no third identity.
 *
 * ── THE RULE ───────────────────────────────────────────────────────────────
 * Education starts apply when the organization holds the education capability
 * AND does not hold `employer`. A multi-capability organization that declared
 * BOTH (an institution that also employs people) keeps the employer starters:
 * for it, "I need workers" is not wrong copy — and the education surfaces
 * stay one typed sentence / one nav step away, exactly as before. This keeps
 * the change additive (ARCHITECTURE §7 question B): nothing a plain company
 * or a dual-capability organization could do is narrowed.
 */
import {
  hasCapability,
  isEducationInstitution,
  type OrganizationCapabilityInput,
} from "@/lib/organizations/capabilities";

/**
 * True when the active organization's home greeting should offer
 * education-shaped starters instead of the employer set.
 */
export function isEducationFirstWorkspace(
  input: OrganizationCapabilityInput,
): boolean {
  return isEducationInstitution(input) && !hasCapability(input, "employer");
}
