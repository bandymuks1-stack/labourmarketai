import { getTranslations } from "next-intl/server";
import { Reveal } from "@/components/marketing/reveal";

/**
 * PR-H global landing — section A: "How it works" in four steps
 * (tell → AI structures → explained opportunities → act in conversation).
 * Server component; copy lives in the `landing.how` namespace. The step cards
 * reveal on scroll via <Reveal/> (reduced-motion → static, no SSR flash).
 */
export async function HowItWorksBand() {
  const t = await getTranslations("landing.how");
  const steps = [
    ["s1t", "s1b"],
    ["s2t", "s2b"],
    ["s3t", "s3b"],
    ["s4t", "s4b"],
  ] as const;

  return (
    <section id="how-it-works" className="mt-16 scroll-mt-24">
      <div className="card-border wow-card p-6 sm:p-10">
        <p className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-label text-brand-cyan">
          <span className="live-dot" aria-hidden />
          {t("eyebrow")}
        </p>
        <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold tracking-tightest text-text-primary sm:text-4xl">
          {t("title")}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary sm:text-base">
          {t("subcopy")}
        </p>

        <ol className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(([titleKey, bodyKey], i) => (
            <Reveal key={titleKey} as="li" delay={i * 0.08} className="flex">
              <div className="flex flex-col gap-3 rounded-xl border border-ink-500 bg-ink-800/40 p-5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-brand-blue/40 bg-brand-blue/10 font-mono text-xs font-semibold text-brand-blue">
                  {i + 1}
                </span>
                <h3 className="font-display text-base font-semibold text-text-primary">
                  {t(titleKey)}
                </h3>
                <p className="text-sm leading-relaxed text-text-secondary">
                  {t(bodyKey)}
                </p>
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
