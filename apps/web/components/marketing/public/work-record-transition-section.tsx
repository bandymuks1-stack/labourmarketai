import { getTranslations } from "next-intl/server";

import { playerInitials } from "@/lib/identity/player-identity";

import { WorkRecordTransition, type TransitionCopy } from "./work-record-transition";

/** Server wrapper: resolves `publicSlice.transition` into plain props so the
 *  client component needs no message provider and ships no extra namespace. */
export async function WorkRecordTransitionSection({ embedded = false }: { embedded?: boolean } = {}) {
  const t = await getTranslations("publicSlice.transition");
  const ts = await getTranslations("publicSlice");
  // The sample persona and organisation are the product-wide ones, already
  // localised under `playercards.sample` (same person as the Player Card).
  const tCards = await getTranslations("playercards");
  const keys = ["work", "proof", "review", "history", "next"] as const;
  const copy: TransitionCopy = {
    title: t("title"),
    sub: t("sub"),
    stageNav: t("stageNav"),
    replay: t("replay"),
    sample: ts("sample"),
    stages: keys.map((k) => ({ label: t(`stages.${k}.label`), caption: t(`stages.${k}.caption`) })),
    pro: {
      name: tCards("sample.name"),
      initials: playerInitials(tCards("sample.name")),
      role: t("pro.role"),
      recordTitle: t("pro.recordTitle"),
      recordText: t("pro.recordText"),
      photoAlt: t("pro.photoAlt"),
      historyLabel: t("pro.historyLabel"),
      historyTitle: t("pro.historyTitle"),
      historyMeta: t("pro.historyMeta"),
      nextLabel: t("pro.nextLabel"),
      nextMeta: t("pro.nextMeta"),
    },
    co: {
      name: tCards("sample.organization"),
      project: t("co.project"),
      waiting: t("co.waiting"),
      done: t("co.done"),
      nextLabel: t("co.nextLabel"),
      nextNeed: t("co.nextNeed"),
      nextCta: t("co.nextCta"),
    },
    states: {
      own: ts("states.own"),
      waiting: ts("states.waiting"),
      confirmed: ts("states.confirmed"),
    },
  };
  return <WorkRecordTransition copy={copy} embedded={embedded} />;
}
