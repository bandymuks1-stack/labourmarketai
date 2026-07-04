import { getTranslations } from "next-intl/server";
import { ConstellationBg } from "@/components/decor/constellation-bg";
import { PlayerCard } from "@/components/app/player-card";

/** "Workers as work profiles" — three FUT-style cards. Sits directly
 *  after the hero; carries the same constellation ambient so it reads as
 *  part of the live system, not a separate brochure block. */
export async function PlayerCardShowcase() {
  const t = await getTranslations("playercards");

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

        <div className="mt-10 flex flex-col items-center gap-6 md:flex-row md:items-stretch md:justify-center lg:gap-8">
          <PlayerCard id="workers.featured.1" />
          <PlayerCard id="workers.featured.2" />
          <PlayerCard id="workers.featured.3" />
        </div>

        {/* §18 honesty line (PR9): these three cards are a CONCEPT preview of
            fictional profiles — said visibly, in words, not only via the
            per-card marker. Real profiles are built by real entries. */}
        <p
          className="mt-4 text-center font-mono text-[11px] uppercase tracking-label text-text-muted"
          data-testid="playercards-concept-note"
        >
          {t("conceptNote")}
        </p>

      </div>
    </section>
  );
}
