import "server-only";

import { getTranslations } from "next-intl/server";

import type { ExecResult } from "@/lib/conversation/executor-contract";
import { projectOpportunitiesResult } from "@/lib/marketplace/opportunities-result";
import {
  loadWorkerOpportunityMatches,
  type MarketplaceMatchesView,
} from "@/lib/marketplace/worker-opportunities";
import type { DiscoveryFilterState } from "@/lib/opportunities/discovery-filters";
import { deriveFitBand } from "@/lib/opportunities/fit-band";
import {
  bandOfStatus,
  countByBand,
  isDiscoveryOnly,
  nonEmptyBands,
} from "@/lib/opportunities/opportunities-view";
import {
  CONVERSATION_FIND_WORK_LIMIT,
  CONVERSATION_FIND_WORK_EXTERNAL_LIMIT,
  type FindWorkResult,
} from "./find-work-contract";

/**
 * The find-work READBACK over an already-loaded marketplace view — the one
 * sentence the chat says. Lives here, not in `find-work.ts` (a `"use server"` file, where every async
 * export is a client-callable action), so the capability door can say the
 * sentence AND project the rows from ONE load (`work.find`).
 */
export async function findWorkReadback(
  view: MarketplaceMatchesView,
): Promise<FindWorkResult> {
  const t = await getTranslations("conversation.findWork");
  if (view.kind !== "ready") {
    return { kind: "blocked", message: t("blockedNoWorker") };
  }
  // Honest blocked state: without the gated worker-visibility RPC there is no
  // PLATFORM demand data. External public-source ads read from their own
  // store, so they still count — "blocked" is only the answer when NOTHING
  // can be shown.
  //
  // The external rows the panel will render are its own display slice of the
  // SAME cards — a slice, never a filter: nothing is dropped or re-selected
  // here, the rows the panel renders are exactly this slice.
  const externalRows = view.externalCards.slice(
    0,
    CONVERSATION_FIND_WORK_EXTERNAL_LIMIT,
  );
  const platformRows = view.capabilities.boardAvailable ? view.matches : [];
  if (!view.capabilities.boardAvailable && externalRows.length === 0) {
    return { kind: "blocked", message: t("blockedNoAccess") };
  }
  if (platformRows.length === 0 && externalRows.length === 0) {
    return { kind: "empty", message: t("emptyState") };
  }

  // Every row banded by the ONE engine's verdict: an external card through
  // its full match (a conflict only on the engine's own word), a platform
  // recommendation through its status — the same derivation the panel and
  // the destination apply, so the three surfaces can never disagree about
  // which band a row is in.
  const banded = [
    ...platformRows.map((m) => ({ band: bandOfStatus(m.status) })),
    ...externalRows.map((c) => ({ band: deriveFitBand(c.match).band })),
  ];
  const counts = countByBand(banded);
  const bands = nonEmptyBands(counts)
    .map((b) => t(`band.${b}` as never, { count: counts[b] } as never))
    .join(", ");
  const total = banded.length;

  // ONE sentence — the count and where the answer lives. Discovery-only
  // (nothing the engine assessed as a fit) is said as such; the production
  // sentence "Radau 2 tinkamų variantų" over an `insufficient_data` "Senior
  // AI Engineer" was exactly the collapse this keeps apart.
  return {
    kind: "matches",
    count: total,
    intro: isDiscoveryOnly(banded)
      ? t("readbackDiscoveryOnly", { total, bands })
      : t("readback", { total, bands }),
  };
}

/**
 * `work.find` for the capability door (MCP / external assistants).
 *
 * The web chat says ONE sentence and opens the Context Panel, which renders
 * the rows. An external assistant has no panel: a bare sentence ("found 3")
 * gave it no demand id to express interest in, no fit, and no skill basis to
 * explain — so it could only repeat a count. This adapter reads the board ONCE
 * (the chat's limit, the caller's filters) and derives from that one view both
 * the chat's sentence (`findWorkReadback`) and the panel's own rows
 * (`projectOpportunitiesResult`), so the sentence and the rows can never
 * describe two different reads.
 *
 * Every outcome stays distinct (SEP-7): no worker profile, the demand source
 * not readable, an honest empty ("the read worked, nothing fits"), and real
 * rows — never one emptiness, and never a technical failure dressed as "no
 * work".
 */
export async function findWorkForCapability(
  filters?: DiscoveryFilterState,
): Promise<ExecResult> {
  const view = await loadWorkerOpportunityMatches({
    surface: "conversation",
    limit: CONVERSATION_FIND_WORK_LIMIT,
    filters,
  });
  const rows = await projectOpportunitiesResult(view);
  if (rows.kind === "no-worker") {
    return {
      ok: false,
      code: "no_worker_profile",
      message: "The caller has no worker profile yet. Nothing was read.",
    };
  }

  const said = await findWorkReadback(view);
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
