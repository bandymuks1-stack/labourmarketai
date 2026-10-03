import { getTranslations } from "next-intl/server";

import { TrackedCta } from "@/components/app/tracked-cta";
import { FAQAccordion } from "@/components/app/faq-accordion";
import { buttonLinkClassName } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/** A public section: plain headline + sentence, with ONE product moment
 *  beside it. Alternating `reverse` keeps the page from reading as a list. */
export function MomentSection({
  id,
  title,
  body,
  reverse = false,
  children,
}: {
  id?: string;
  title: string;
  body: string;
  reverse?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mx-auto max-w-container scroll-mt-24 px-6 py-14 sm:px-12 lg:py-20">
      <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
        <div className={cn(reverse && "lg:order-2")}>
          <h2 className="font-display text-3xl font-bold leading-[1.08] tracking-tightest text-text-primary sm:text-5xl">
            {title}
          </h2>
          <p className="mt-4 max-w-lg text-lg leading-relaxed text-text-secondary">{body}</p>
        </div>
        <div className={cn(reverse && "lg:order-1")}>{children}</div>
      </div>
    </section>
  );
}

/** The soft surface every product moment sits on — space and one tonal step,
 *  not a border. `Example` is always visible: nothing here is a real person. */
export function MomentCard({
  sampleLabel,
  children,
  className,
  testId,
}: {
  sampleLabel: string;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div data-testid={testId} className={cn("relative rounded-3xl bg-ink-800 p-6 sm:p-8", className)}>
      <span className="absolute right-5 top-5 rounded-full bg-ink-900/60 px-3 py-1 text-basis text-text-muted">
        {sampleLabel}
      </span>
      {children}
    </div>
  );
}

export async function PublicFaq({ audience }: { audience: "workers" | "companies" }) {
  const t = await getTranslations(`publicSlice.${audience}.faq`);
  const sh = await getTranslations("shared");
  const items = t.raw("items") as { q: string; a: string }[];
  return (
    <section className="mx-auto max-w-3xl px-6 py-14 sm:px-12 lg:py-20">
      <h2 className="font-display text-3xl font-bold tracking-tightest text-text-primary sm:text-4xl">
        {t("title")}
      </h2>
      <div className="mt-8">
        <FAQAccordion items={items} expandAria={sh("faq.expand_aria")} />
      </div>
    </section>
  );
}

export function PublicCtaEnd({
  title,
  accent,
  label,
  href,
  ctaId,
  audience,
}: {
  title: string;
  accent: string;
  label: string;
  href: string;
  ctaId: string;
  audience: "workers" | "companies";
}) {
  return (
    <section className="mx-auto max-w-container px-6 pb-24 pt-10 text-center sm:px-12">
      <h2 className="mx-auto max-w-3xl font-display text-3xl font-bold leading-[1.08] tracking-tightest text-text-primary sm:text-5xl">
        {title} <span className="text-gradient-accent">{accent}</span>
      </h2>
      <div className="mt-8">
        <TrackedCta href={href} ctaId={ctaId} audience={audience} className={buttonLinkClassName("primary")}>
          {label} →
        </TrackedCta>
      </div>
    </section>
  );
}
