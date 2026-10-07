import { getTranslations } from "next-intl/server";

import { WorkLifecycleSection } from "@/components/marketing/work-lifecycle-section";

import { ExploreFold } from "./explore-fold";

/**
 * The full lifecycle graph — every stage a real door into the workspace — kept
 * for the visitor who wants it, but folded away so it is not another technical
 * strip in the primary story (owner directive 2026-10-02). Nothing was removed:
 * the graph, its routes and its keyboard behaviour are unchanged inside. The
 * graph's client code is only mounted once the fold is opened, so the default
 * page does not pay for it (first-load JS / long tasks on a phone).
 */
export async function ExploreSteps({ audience }: { audience: "workers" | "companies" }) {
  const t = await getTranslations("publicSlice.explore");
  return (
    <ExploreFold summary={t("summary")}>
      <WorkLifecycleSection audience={audience} />
    </ExploreFold>
  );
}
