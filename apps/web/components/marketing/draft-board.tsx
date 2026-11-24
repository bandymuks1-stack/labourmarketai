import { getTranslations } from "next-intl/server";
import { ConstellationBg } from "@/components/decor/constellation-bg";
import { DraftBoardColumns } from "@/components/app/draft-board-columns";

/** "Live matching" section — sits between PlayerCardShowcase and the
 *  existing 4-col second row. The columns subcomponent handles the pipeline
 *  rotation and animation; this wrapper supplies the section chrome. */
export async function DraftBoard() {
  const t = await getTranslations("draft");
  return (
    <section className="relative mt-16 overflow-hidden">
      <ConstellationBg />
      <div className="relative mx-auto max-w-container px-6 sm:px-12">
        <p className="inline-flex items-center gap-2 rounded-sm border border-ink-500 px-3 py-1 font-mono text-meta uppercase tracking-label text-text-secondary">
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

        <div className="mt-8">
          <DraftBoardColumns />
        </div>
      </div>
    </section>
  );
}
