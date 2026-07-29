import { getTranslations } from "next-intl/server";
import { Reveal } from "@/components/marketing/reveal";

/**
 * PROOF BAND — fact vs proven skill vs opinion (landing rebuild 2026-07-29).
 *
 * The owner's reputation model, stated to the visitor exactly as the product
 * enforces it internally:
 *
 *   - a WORK FACT is an append-only journal record of what happened;
 *   - a PROVEN SKILL is a skill backed by those records (and, when a manager
 *     recorded it, by their record too);
 *   - an OPINION is a subjective +1/−1 with text — labelled as opinion,
 *     never blended into the facts, never a star rating.
 *
 * NO STARS anywhere — §19: people are never scored. Server component, calm
 * three-column layout, motion via <Reveal/>.
 */
export async function ProofBand() {
  const t = await getTranslations("landing.proof");

  const kinds = [
    { key: "fact", accent: "border-state-success/40", chip: "text-state-success" },
    { key: "skill", accent: "border-brand-cyan/40", chip: "text-brand-cyan" },
    { key: "opinion", accent: "border-state-amber/40", chip: "text-state-amber" },
  ] as const;

  return (
    <section className="mt-24" aria-labelledby="proof-band-title">
      <Reveal>
        <p className="font-mono text-[11px] uppercase tracking-label text-text-secondary">
          {t("eyebrow")}
        </p>
        <h2
          id="proof-band-title"
          className="mt-3 max-w-2xl font-display text-3xl font-bold leading-[1.08] tracking-tightest sm:text-4xl"
        >
          {t("title")}
        </h2>
      </Reveal>
      <Reveal delay={0.08}>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {kinds.map(({ key, accent, chip }) => (
            <div key={key} className={`rounded-xl border ${accent} bg-ink-800/40 p-5`}>
              <p className={`font-mono text-[11px] uppercase tracking-label ${chip}`}>
                {t(`${key}.label`)}
              </p>
              <p className="mt-2 text-sm font-semibold text-text-primary">
                {t(`${key}.title`)}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-text-secondary">
                {t(`${key}.body`)}
              </p>
            </div>
          ))}
        </div>
      </Reveal>
      <Reveal delay={0.12}>
        {/* The one-line rule that separates this platform from star ratings. */}
        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-text-secondary">
          {t("noStars")}
        </p>
      </Reveal>
    </section>
  );
}
