import "server-only";

import { getTranslations } from "next-intl/server";

import {
  type WorkspaceInfo,
  workspaceDisplayLabels,
} from "@/lib/company/organization-switch";

/**
 * THE WORKSPACE LABEL, for capability callers — the SAME one a web user reads.
 *
 * WHY THIS EXISTS. `workspaceDisplayLabels` (lib/company/organization-switch)
 * is the canonical builder: the chat workspace chip and `/dashboard/network`
 * both render from it. The capability layer had a SECOND labeller, written
 * inline in `context.switch`, and the two had drifted into different answers
 * about the same workspaces:
 *
 *   canonical            an organization with no stored name gets a phrase that
 *                        SAYS the name is missing, chosen by its real type; two
 *                        unnamed organizations of the SAME type are told apart
 *                        by a fragment of the organization id — never a counter
 *   the inline copy      one shared `notSet` string for every unnamed
 *                        organization, and a RELATIONSHIP appended when two
 *                        labels collided
 *
 * So an MCP or mobile caller was shown different names than a web user for the
 * same list, and two unnamed organizations of the same type in the same
 * relationship collapsed to identical text with nothing to tell them apart —
 * which is precisely the defect the owner read on production on 2026-09-07 and
 * the canonical builder was written to end. (Its own note records why a
 * counter is never the answer: "Įmonės erdvė 1 / 2" sat in a list beside a
 * real registered company and read as two more real companies.)
 *
 * The four unnamed-organization phrases are read from `conversation.chat`,
 * where they already live, rather than copied into the `capabilities`
 * namespace. Four strings duplicated across eleven catalogues is a second copy
 * that drifts; these are the exact words the owner walk settled on, and there
 * should only ever be one set of them.
 *
 * Returns a function so a caller labels a list once and then reads each row —
 * the collision rule is a property of the WHOLE list and cannot be evaluated
 * one workspace at a time.
 */
export async function workspaceLabeller(
  locale: string,
  workspaces: readonly WorkspaceInfo[],
): Promise<(workspace: WorkspaceInfo) => string> {
  const t = await getTranslations({ locale, namespace: "conversation.chat" });
  const labelById = workspaceDisplayLabels(workspaces, {
    personal: t("workspacePersonal"),
    unnamedOrganization: {
      company: t("workspaceUnnamedCompany"),
      agency: t("workspaceUnnamedAgency"),
      team: t("workspaceUnnamedTeam"),
      other: t("workspaceUnnamed"),
    },
  });
  // A workspace absent from the map cannot happen (the builder covers every
  // row it is given) — but falling back to the stored name is still the honest
  // answer rather than an empty label.
  return (workspace) => labelById.get(workspace.id) ?? workspace.name;
}
