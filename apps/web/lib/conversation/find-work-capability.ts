import "server-only";

import type { ExecResult } from "@/lib/conversation/executor-contract";
import { loadOpportunitiesResult } from "@/lib/marketplace/opportunities-result";
import type { DiscoveryFilterState } from "@/lib/opportunities/discovery-filters";
import { findWorkForChat } from "./find-work";
import { CONVERSATION_FIND_WORK_LIMIT } from "./find-work-contract";

/**
 * `work.find` for the capability door (MCP / external assistants).
 *
 * The web chat says ONE sentence and opens the Context Panel, which renders
 * the rows. An external assistant has no panel: a bare sentence ("found 3")
 * gave it no demand id to express interest in, no fit, and no skill basis to
 * explain — so it could only repeat a count. This adapter returns the chat's
 * sentence AND the panel's own rows, read through the SAME projection
 * (`loadOpportunitiesResult`) with the chat's limit and the caller's filters,
 * so the count the sentence states is the rows it carries.
 *
 * Every outcome stays distinct (SEP-7): no worker profile, the demand source
 * not readable, an honest empty ("the read worked, nothing fits"), and real
 * rows — never one emptiness, and never a technical failure dressed as "no
 * work".
 */
export async function findWorkForCapability(
  filters?: DiscoveryFilterState,
): Promise<ExecResult> {
  const rows = await loadOpportunitiesResult({
    limit: CONVERSATION_FIND_WORK_LIMIT,
    filters,
  });
  if (rows.kind === "no-worker") {
    return {
      ok: false,
      code: "no_worker_profile",
      message: "The caller has no worker profile yet. Nothing was read.",
    };
  }

  const said = await findWorkForChat(filters);
  if (said.kind === "blocked") {
    return {
      ok: false,
      code: "unavailable",
      message:
        "This could not be read right now. That is not the same as 'nothing' — try again.",
    };
  }

  // The panel's UI copy (interest button labels) means nothing to an external
  // client and is not carried; everything else crosses as the panel gets it.
  const ready = rows.kind === "ready" ? rows : null;
  return {
    ok: true,
    data: {
      kind: said.kind,
      ...(said.kind === "matches"
        ? { count: said.count, intro: said.intro }
        : { message: said.message }),
      // `null` = the platform demand rows could not be read (external public
      // ads may still have been counted) — not "none".
      matches: ready ? ready.matches : null,
      totalRecommendable: ready ? ready.totalRecommendable : null,
      external: ready ? ready.external : null,
      totalExternal: ready ? ready.totalExternal : null,
      interestAvailable: ready ? ready.interestLabels !== null : null,
      note:
        "fitStatus is the matching engine's verdict; only 'strong' and 'possible' may be called a fit. " +
        "matchedSkillSlugs are skills the worker's own record holds; needSkillsUnconfirmed=true means the " +
        "need's skills were recognized from its text and the company has not confirmed them. " +
        "To express interest use interest.express_draft with a requestId from matches.",
    },
  };
}
