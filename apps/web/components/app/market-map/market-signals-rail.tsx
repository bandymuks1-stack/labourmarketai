import { getTranslations } from "next-intl/server";

import { MarketSignalList } from "@/components/app/market-map/market-signal-list";
import { MarketSignalsSheet } from "@/components/app/market-map/market-signals-sheet";
import type { MarketBrief } from "@/lib/market-map/market-brief-model";

/**
 * THE MARKET'S SIGNALS RAIL — beside the one canonical map. The same
 * `MarketBrief` and the same list the home carries, so the map and the home
 * can never state different things. Two standing notes keep the page honest:
 * people are never counted here (anonymous; groups under five are withheld —
 * so the map cannot imply a visible supply), and marker size is relative to
 * what is in view, never a measure of the market.
 */
export async function MarketSignalsRail({ brief }: { readonly brief: MarketBrief }) {
  const t = await getTranslations("marketMap.signals");
  // The collapsed phone summary is the headline signal: needs, in words.
  const needs = brief.needs;
  const summary =
    needs.state === "known"
      ? t("needs.line", { count: needs.count, lower: needs.lowerBound ? "yes" : "no" })
      : needs.state === "unknown"
        ? t("needs.unknown")
        : t("needs.empty");

  return (
    <MarketSignalsSheet title={t("title")} toggleLabel={t("toggle")} summary={summary}>
      <p className="mb-2 text-support text-text-secondary">{t("lead")}</p>
      <MarketSignalList brief={brief} variant="rail" />
      <p className="mt-3 text-support text-text-muted" data-testid="market-signals-people-note">
        {t("peopleNote")}
      </p>
      <p className="mt-2 text-support text-text-muted" data-testid="market-signals-size-note">
        {t("sizeNote")}
      </p>
    </MarketSignalsSheet>
  );
}
