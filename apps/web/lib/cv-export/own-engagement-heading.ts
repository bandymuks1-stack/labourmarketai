/**
 * WHAT ONE OF THE PERSON'S OWN ENGAGEMENTS IS CALLED ON THE LIVING CV.
 *
 * A job saved from a CV or typed by hand has no organization: its whole
 * statement ("Virėjas, UAB Maistas") is the title. The Living CV used to take
 * the title only when an organization existed, so every such job read
 * "Darbuotojas" and what the person actually did was gone (found 2026-11-04,
 * UF-3). The relationship word stays beside the title, so a placement is never
 * read as a job.
 *
 * PRACTICE KEEPS ITS WORD EVEN BESIDE AN ORGANIZATION. Once an organization
 * was named the relationship word used to give way to it, so a study
 * placement at a company, or a learner's link to a school, was listed under
 * "where you have worked" exactly like a job there. For practice (study,
 * volunteering, internship) the word is now always printed; employment reads
 * as before.
 */
export function ownEngagementHeading(e: {
  readonly orgName: string | null;
  readonly title: string | null;
  readonly relationshipLabel: string;
  /** `kind === "practice"` of the engagement (`historyKindOf`). */
  readonly practice?: boolean;
}): { readonly title: string; readonly subtitle: string | null } {
  const title = e.title?.trim() || null;
  if (!title) {
    return {
      title: e.orgName ?? e.relationshipLabel,
      subtitle: e.practice && e.orgName ? e.relationshipLabel : null,
    };
  }
  if (e.practice && e.orgName) {
    return { title, subtitle: `${e.orgName} · ${e.relationshipLabel}` };
  }
  return { title, subtitle: e.orgName ?? e.relationshipLabel };
}
