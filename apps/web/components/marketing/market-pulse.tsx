import { getTranslations } from "next-intl/server";
import { ConstellationBg } from "@/components/decor/constellation-bg";
import { RecentMatchesFeed } from "@/components/app/recent-matches-feed";
import { RegionalHeatmap } from "@/components/app/regional-heatmap";
import { SkillsDemandList } from "@/components/app/skills-demand-list";
import { SupplyDemandChart } from "@/components/app/supply-demand-chart";

/** "Market pulse" — 2×2 panel grid Bloomberg-terminal style.
 *  PROJECT_VISION.md §8 module 11 (market intelligence). */
export async function MarketPulse() {
  const t = await getTranslations("marketPulse");
  return (
    <section className="relative mt-16 overflow-hidden">
      <ConstellationBg />
      <div className="relative mx-auto max-w-container px-6 sm:px-12">
        <p className="inline-flex items-center gap-2 rounded-sm border border-ink-500 px-3 py-1 font-mono text-[11px] uppercase tracking-label text-text-secondary">
          <span className="live-dot" aria-hidden />
          {t("eyebrow")}
        </p>
        <h2 className="mt-5 font-display text-4xl font-bold leading-[1.06] tracking-tightest sm:text-5xl">
          {t("headline.line1")}
          <br />
          <span className="text-gradient-accent">{t("headline.line2")}</span>
        </h2>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-text-secondary">
          {t("subcopy")}
        </p>

        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          <RegionalHeatmap />
          <SkillsDemandList />
          <SupplyDemandChart />
          <RecentMatchesFeed />
        </div>
      </div>
    </section>
  );
}
