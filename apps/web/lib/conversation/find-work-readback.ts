import "server-only";

import { getTranslations } from "next-intl/server";

import type { MarketplaceMatchesView } from "@/lib/marketplace/worker-opportunities";
import { deriveFitBand } from "@/lib/opportunities/fit-band";
import {
  bandOfStatus,
  countByBand,
  isDiscoveryOnly,
  nonEmptyBands,
} from "@/lib/opportunities/opportunities-view";
import {
  CONVERSATION_FIND_WORK_EXTERNAL_LIMIT,
  type FindWorkResult,
} from "./find-work-contract";

/**
 * The find-work READBACK over an already-loaded marketplace view — the one
 * sentence the chat says. Split out of `find-work.ts` (a `"use server"` file,
 * where every async export is a client-callable action) so the capability door
 * can say the sentence AND project the rows from ONE load (`work.find`).
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
