import { ChevronDown } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { TrackedCta } from "@/components/app/tracked-cta";
import { getBillingConfigFor } from "@/lib/billing/config";
import { isStripeActive } from "@/lib/billing/config-core";

/**
 * Concierge-first commercial offer (launch repair Scope C).
 *
 * The public pricing page must read as a commercial page, not a billing
 * console: no PAYMENTS_ENABLED states, no Stripe test mode, no price IDs or
 * plan slugs. These two components replace the technical billing surfaces:
 *
 * - `ConciergeAccessBanner` — honest early-access line + CTA to /company-need
 *   (replaces the BillingStatusBanner state machine on the public page).
 * - `ConciergeOfferSection` — how the first paid service works: free need
 *   submission, human operator review, manually checked shortlist (no fee
 *   without a suitable shortlist, no promise a candidate is always found),
 *   fixed success fee + coordination fee only when actually delivered, final
 *   price confirmed before paid work starts.
 *
 * §18 Realumo principas: this is the real service description, not a
 * demo/trial wrapper — no "bandomoji prieiga" / pilot-mode framing.
 * Copy lives in the `conciergeOffer` namespace (en/lt/ru + nl/de when active).
 */

export async function ConciergeAccessBanner() {
  const t = await getTranslations("conciergeOffer.banner");
  // With Stripe LIVE the sentence "public payments are not enabled yet" would
  // be false (prod walk b6a2e7bf, 2026-09-05). The concierge offer itself stays:
  // the live variant keeps the direct-service promise without the claim.
  const live = isStripeActive(getBillingConfigFor(null));

  return (
    <section
      className="mx-auto max-w-container px-6 pt-6 sm:px-12"
      data-testid="concierge-access-banner"
    >
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-brand-blue/40 bg-brand-blue/5 px-4 py-3">
        <span className="rounded-sm border border-brand-blue/40 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-brand-blue">
          {t("badge")}
        </span>
        <p className="min-w-0 basis-full text-xs leading-relaxed text-text-secondary sm:basis-0 sm:flex-1" data-billing-live={live ? "true" : "false"}>
          {live ? t("bodyLive") : t("body")}
        </p>
        <TrackedCta
          href="/company-need"
          ctaId="concierge_banner_need"
          audience="companies"
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-brand-blue px-4 py-2 text-xs font-semibold text-text-on-brand hover:opacity-90"
        >
          {t("cta")}
        </TrackedCta>
      </div>
    </section>
  );
}

export async function ConciergeOfferSection() {
  const t = await getTranslations("conciergeOffer");
  const steps = t.raw("steps") as { title: string; body: string }[];

  return (
    <section
      className="mx-auto max-w-container px-6 pt-10 sm:px-12"
      data-testid="concierge-offer-section"
    >
      {/* The service is named and marked as NOT a platform plan on the page;
          how it runs, its fee note and its action open on a tap (owner
          2026-11-24, decisions 0032 / 0034). Nothing is removed. */}
      <details className="group rounded-2xl border border-ink-600 bg-surface-1/60" data-testid="concierge-offer-fold">
        <summary className="grid min-h-11 cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 rounded-2xl p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue [&::-webkit-details-marker]:hidden">
          <h2 className="font-display text-xl font-bold tracking-tightest text-text-primary">{t("title")}</h2>
          <ChevronDown
            aria-hidden
            className="row-span-2 size-5 shrink-0 text-text-secondary transition-transform group-open:rotate-180 motion-reduce:transition-none"
          />
          <span className="mt-1 block max-w-3xl text-sm leading-relaxed text-text-secondary" data-testid="concierge-offer-separate">
            {t("separate")}
          </span>
        </summary>
        <div className="px-5 pb-5">
          <ol className="grid gap-4 md:grid-cols-2">
            {steps.map((step, i) => (
              <li key={step.title} className="card-border p-5">
                <p className="font-mono text-meta uppercase tracking-label text-brand-blue">{i + 1}</p>
                <h3 className="mt-2 font-display text-base font-semibold text-text-primary">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">{step.body}</p>
              </li>
            ))}
          </ol>
          <p className="mt-5 max-w-3xl text-xs leading-relaxed text-text-muted">{t("note")}</p>
          <div className="mt-5">
            <TrackedCta
              href="/company-need"
              ctaId="concierge_card_need"
              audience="companies"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-brand-blue px-5 py-2.5 text-sm font-semibold text-text-on-brand hover:opacity-90"
            >
              {t("ctaLabel")}
            </TrackedCta>
          </div>
        </div>
      </details>
    </section>
  );
}
