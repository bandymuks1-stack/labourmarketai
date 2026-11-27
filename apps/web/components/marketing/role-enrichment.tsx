import { getLocale, getTranslations } from "next-intl/server";
import { ChevronDown } from "lucide-react";
import { ConstellationBg } from "@/components/decor/constellation-bg";
import { CtaBand } from "@/components/marketing/cta-band";
import { FAQAccordion } from "@/components/app/faq-accordion";
import { JourneyTimeline } from "@/components/app/journey-timeline";
import { faqPageJsonLd } from "@/lib/seo/faq-json-ld";
import { jsonLdScript } from "@/lib/seo/json-ld";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="inline-flex items-center gap-2 rounded-sm border border-ink-500 px-3 py-1 font-mono text-meta uppercase tracking-label text-text-secondary">
      <span className="live-dot" aria-hidden />
      {children}
    </p>
  );
}

/**
 * Sections (a), (b), (d), (e) shared by the /for-* sub-pages (5b.3.5). The
 * former (c) feature grid repeated the page's benefit cards and journey
 * steps item for item; it was removed (owner copy cleanup 2026-11-15).
 * The
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
  ctaNext,
  afterPreview,
}: {
  root: "workers" | "companies" | "agencies";
  previewKey: "profile" | "demand" | "pool";
  /** Optional. Public pages pass none: no fabricated example data (containment 2026-10-08). */
  preview?: React.ReactNode;
  ctaSource: string;
  ctaKind: "signup" | "waitlist";
  /** Same opt-in as `PageHero.ctaNext`: an internal path the signup CTA
   *  carries through `?next=`, so a page that promises ONE thing does not
   *  drop the visitor on the generic dashboard. Omitted = the default. */
  ctaNext?: string;
  /** Optional block rendered right after the preview section (e.g. a page
   *  that wants its benefit cards BELOW the visual proof, not above it). */
  afterPreview?: React.ReactNode;
}) {
  const t = await getTranslations(root);
  const sh = await getTranslations("shared");

  const bullets = t.raw(`${previewKey}.bullets`) as string[];
  const steps = t.raw("journey.steps") as { title: string; desc: string }[];
  const faq = t.raw("faq.items") as { q: string; a: string }[];
  // The same items the accordion below renders (AEO, decision 0009).
  const faqLd = faqPageJsonLd(faq, await getLocale());

  return (
    <div className="relative overflow-hidden">
      <ConstellationBg />

      {/* The explanation (what the view holds, and the steps) sits behind
          one fold (owner order 2026-11-24, decisions 0032 and 0034): the page
          is the offer, the work chain, the questions and the action. Nothing
          is removed; one tap opens it, and it is in the document for search
          engines either way. */}
      <details
        className="group relative mx-auto mt-10 max-w-container px-6 sm:px-12"
        data-testid="role-enrichment-more"
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-2xl border border-ink-600 bg-surface-1/60 px-5 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue [&::-webkit-details-marker]:hidden">
          <h2 className="font-display text-lg font-semibold text-text-primary">{t("journey.headline")}</h2>
          <ChevronDown
            aria-hidden
            className="size-5 shrink-0 text-text-secondary transition-transform group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <div className="pb-4">
          {/* (a) preview */}
          <section className="relative pt-6">
            <Eyebrow>{t(`${previewKey}.eyebrow`)}</Eyebrow>
            <h3 className="mt-5 font-display text-2xl font-bold leading-[1.08] tracking-tightest sm:text-3xl">
              {t(`${previewKey}.headline.line1`)}{" "}
              <span className="text-gradient-accent">
                {t(`${previewKey}.headline.line2`)}
              </span>
            </h3>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-text-secondary">
              {t(`${previewKey}.subcopy`)}
            </p>
            <div className={preview ? "mt-10 grid items-center gap-10 lg:grid-cols-2" : "mt-10"}>
              {/* min-w-0: a grid item defaults to its content's min width, so a
                  wide preview pushed the column past a phone screen (622 px in
                  375 px, prod 2026-09-29) and the card was clipped. */}
              {preview ? <div className="flex min-w-0 justify-center">{preview}</div> : null}
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

          {afterPreview}

          {/* (b) journey */}
          <section className="relative pt-12">
            <Eyebrow>{t("journey.eyebrow")}</Eyebrow>
            <div className="mt-10">
              <JourneyTimeline steps={steps} />
            </div>
          </section>
        </div>
      </details>

      {/* (d) FAQ */}
      <section className="relative mx-auto max-w-3xl px-6 pt-12 sm:px-12">
        <Eyebrow>{t("faq.eyebrow")}</Eyebrow>
        <h2 className="mt-5 font-display text-2xl font-bold tracking-tightest text-text-primary sm:text-3xl">
          {t("faq.headline")}
        </h2>
        <div className="mt-8">
          <FAQAccordion items={faq} expandAria={sh("faq.expand_aria")} />
        </div>
        {faqLd ? (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(faqLd) }} />
        ) : null}
      </section>

      {/* (e) strong CTA */}
      <div className="relative pt-12">
        <CtaBand
          title={t("cta.headline.line1")}
          accent={t("cta.headline.line2")}
          subtitle={t("cta.subcopy")}
          ctaKind={ctaKind}
          ctaLabel={t("cta.button")}
          ctaSource={ctaSource}
          ctaNext={ctaNext}
        />
      </div>
    </div>
  );
}
