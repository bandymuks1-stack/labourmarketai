import "server-only";

import { getTranslations } from "next-intl/server";

import { listMyEngagements } from "@/lib/invitations/network";
import { readLearningCompass } from "@/lib/learning/learning-compass";
import type { WorkflowChip } from "@/lib/ai-workspace/workflow-contract";
import { internshipNextSteps } from "@/lib/conversation/education-next-steps";

/**
 * INTERNSHIP NEXT STEPS — the READ half (gap G-C2). Reads the two facts the
 * pure decision needs through the SAME canonical reads the compass answer and
 * the opening brief already use (`readLearningCompass`, `listMyEngagements`),
 * then localises the decision. A failed read contributes NOTHING it cannot
 * prove: no profession is then "unknown" (the direction step is offered — the
 * safe side), no institution is named.
 *
 * Returns localised lines to append to the honest "nothing visible" answer
 * and the chips to offer instead of a dead end.
 */
export async function loadInternshipNextSteps(): Promise<{
  readonly lines: readonly string[];
  readonly chips: readonly WorkflowChip[];
}> {
  const t = await getTranslations("workspace.ai");

  let professionSlug: string | null = null;
  try {
    const compass = await readLearningCompass();
    if (compass.status === "ok") professionSlug = compass.compass.becoming.professionSlug;
  } catch {
    /* unknown profession → the direction step is offered */
  }

  let institutionName: string | null = null;
  try {
    const engagements = await listMyEngagements();
    const student = engagements.find((e) => e.relationshipSlug === "student");
    institutionName = student?.organizationName ?? null;
  } catch {
    /* no institution named — never invented */
  }

  const decision = internshipNextSteps({ professionSlug, institutionName });
  return {
    lines: decision.lines.map((l) =>
      l.key === "internshipAskInstitution" ? t(l.key, { institution: l.institution ?? "" }) : t(l.key),
    ),
    chips: decision.chips.map((c) => ({ id: c.id, label: t(c.labelKey) })),
  };
}
