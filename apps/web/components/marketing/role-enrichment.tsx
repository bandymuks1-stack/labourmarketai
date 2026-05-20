import { getTranslations } from "next-intl/server";
import { ConstellationBg } from "@/components/decor/constellation-bg";
import { BenefitCards } from "@/components/marketing/benefit-cards";
import { CtaBand } from "@/components/marketing/cta-band";
import { FAQAccordion } from "@/components/app/faq-accordion";
import { JourneyTimeline } from "@/components/app/journey-timeline";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="inline-flex items-center gap-2 rounded-sm border border-ink-500 px-3 py-1 font-mono text-[11px] uppercase tracking-label text-text-secondary">
      <span className="live-dot" aria-hidden />
      {children}
    </p>
  );
}

/**
 * Sections (a)–(e) shared by the three /for-* sub-pages (5b.3.5). The
 * page supplies the role-specific preview node; everything else comes
 * from the `root` i18n namespace. One constellation ambient ties the
 * whole block to the live system without a per-section SVG cost.
 */
export async function RoleEnrichment({
  root,
  previewKey,
  preview,
  ctaSource,
  ctaKind,
}: {
  root: "workers" | "companies" | "agencies";
  previewKey: "profile" | "demand" | "pool";
  preview: React.ReactNode;
  ctaSource: string;
  ctaKind: "signup" | "waitlist";
}) {
  const t = await getTranslations(root);
  const sh = await getTranslations("shared");

  const bullets = t.raw(`${previewKey}.bullets`) as string[];
  const steps = t.raw("journey.steps") as { title: string; desc: string }[];
  const features = t.raw("features.items") as {
    title: string;
    desc: string;
  }[];
  const faq = t.raw("faq.items") as { q: string; a: string }[];

  return (
    <div className="relative overflow-hidden">
      <ConstellationBg />

      {/* (a) preview */}
      <section className="relative mx-auto max-w-container px-6 pt-16 sm:px-12">
        <Eyebrow>{t(`${previewKey}.eyebrow`)}</Eyebrow>
        <h2 className="mt-5 font-display text-3xl font-bold leading-[1.08] tracking-tightest sm:text-4xl">
          {t(`${previewKey}.headline.line1`)}{" "}
          <span className="text-gradient-accent">
            {t(`${previewKey}.headline.line2`)}
          </span>
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-text-secondary">
          {t(`${previewKey}.subcopy`)}
        </p>
        <div className="mt-10 grid items-center gap-10 lg:grid-cols-2">
          <div className="flex justify-center">{preview}</div>
          <ul className="flex flex-col gap-4">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-3 text-sm text-text-secondary">
                <span
                  aria-hidden
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue"
                />
                {b}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* (b) journey */}
      <section className="relative mx-auto max-w-container px-6 pt-20 sm:px-12">
        <Eyebrow>{t("journey.eyebrow")}</Eyebrow>
        <h2 className="mt-5 font-display text-2xl font-bold tracking-tightest text-text-primary sm:text-3xl">
          {t("journey.headline")}
        </h2>
        <div className="mt-10">
          <JourneyTimeline steps={steps} />
        </div>
      </section>

      {/* (c) feature grid */}
      <section className="relative mx-auto max-w-container px-6 pt-20 sm:px-12">
        <Eyebrow>{t("features.eyebrow")}</Eyebrow>
        <h2 className="mt-5 font-display text-2xl font-bold tracking-tightest text-text-primary sm:text-3xl">
          {t("features.headline")}
        </h2>
        <div className="mt-8">
          <BenefitCards
            items={features.map((f) => ({ title: f.title, body: f.desc }))}
          />
        </div>
      </section>

      {/* (d) FAQ */}
      <section className="relative mx-auto max-w-3xl px-6 pt-20 sm:px-12">
        <Eyebrow>{t("faq.eyebrow")}</Eyebrow>
        <h2 className="mt-5 font-display text-2xl font-bold tracking-tightest text-text-primary sm:text-3xl">
          {t("faq.headline")}
        </h2>
        <div className="mt-8">
          <FAQAccordion items={faq} expandAria={sh("faq.expand_aria")} />
        </div>
      </section>

      {/* (e) strong CTA */}
      <div className="relative pt-20">
        <CtaBand
          title={t("cta.headline.line1")}
          accent={t("cta.headline.line2")}
          subtitle={t("cta.subcopy")}
          ctaKind={ctaKind}
          ctaLabel={t("cta.button")}
          ctaSource={ctaSource}
        />
      </div>
    </div>
  );
}
