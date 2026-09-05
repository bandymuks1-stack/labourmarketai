import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { WaitlistModal } from "@/components/marketing/waitlist-modal";
import { getPlans, PLAN_SLUGS } from "@/lib/marketing/plans";
import { PRICING_READINESS_STATE } from "@/lib/billing/readiness";
import { getBillingConfig } from "@/lib/billing/config";
import { isStripeActive } from "@/lib/billing/config-core";

/**
 * /pricing — the owner's LAUNCH table (approved 2026-09-05):
 *
 *   €0          for getting started            1 active position
 *   €99/month   for organizations actively     up to 10 active positions
 *               hiring / building teams
 *   Need more?  contact us for an individual plan (no public tier, no price)
 *
 * The price FIGURE is read from `plans.price_eur_monthly` (the one home a
 * price has) and rendered only once PRICING_READINESS_STATE is
 * `owner_confirmed`; nothing here hard-codes a figure. Buying happens in the
 * organization's own account (server-bound to the organization, never from a
 * public page); while no Stripe adapter is active the card keeps the honest
 * waitlist path.
 */
export async function PricingTable() {
  const t = await getTranslations("pricing");
  const locale = await getLocale();
  const rows = await getPlans(); // null if Supabase unreachable in preview
  const confirmed = PRICING_READINESS_STATE === "owner_confirmed";
  const billingOn = isStripeActive(getBillingConfig());
  const cardClass = "flex flex-col card-border p-6";

  return (
    <section className="mx-auto grid max-w-container gap-6 px-6 pb-16 sm:px-12 lg:grid-cols-3">
      {PLAN_SLUGS.map((slug) => {
        const row = rows?.find((r) => r.slug === slug);
        const dbName = locale === "lt" ? row?.name_lt : row?.name_en;
        const name = dbName ?? t(`plans.${slug}.name`);
        const features = t.raw(`plans.${slug}.features`) as string[];
        const price = confirmed && typeof row?.price_eur_monthly === "number" ? row.price_eur_monthly : null;

        return (
          <div key={slug} className={cardClass} data-testid={`pricing-plan-${slug}`}>
            <p className="font-mono text-meta uppercase tracking-label text-text-muted">
              {name}
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              {t(`plans.${slug}.tagline`)}
            </p>
            {/* Price slot: the DB figure (plans.price_eur_monthly) once the owner
                confirmed the table; otherwise the readiness copy and nothing
                else — never a fabricated placeholder. */}
            {price !== null ? (
              <p
                className="mt-5 font-display text-3xl font-bold tracking-tightest text-text-primary"
                data-testid={`pricing-price-${slug}`}
              >
                {price === 0 ? t("priceFree") : t("pricePerMonth", { price })}
              </p>
            ) : null}
            <p
              className={price !== null ? "mt-2 text-meta leading-snug text-text-muted" : "mt-5 text-sm font-semibold leading-snug text-text-primary"}
              data-testid={`pricing-price-state-${slug}`}
              data-state={PRICING_READINESS_STATE}
            >
              {t(`priceState.${PRICING_READINESS_STATE}` as never)}
            </p>

            <p className="mt-6 font-mono text-meta uppercase tracking-label text-text-muted">
              {t("featuresLabel")}
            </p>
            <ul className="mt-3 flex flex-1 flex-col gap-2 text-sm text-text-secondary">
              {features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <span
                    aria-hidden
                    className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue"
                  />
                  {f}
                </li>
              ))}
            </ul>

            <div className="mt-6">
              {billingOn && confirmed ? (
                <Link
                  href="/dashboard/account"
                  className="text-sm font-semibold text-brand-blue hover:underline"
                  data-testid={`pricing-cta-${slug}`}
                >
                  {price === 0 ? t("ctaStartFree") : t("ctaSubscribe")}
                </Link>
              ) : (
                <WaitlistModal
                  trigger={t("planCta")}
                  source={`pricing_${slug}`}
                  triggerClassName="text-sm font-semibold text-text-primary"
                />
              )}
            </div>
          </div>
        );
      })}

      {/* Above the paid ceiling there is no automatic public tier — a
          conversation. Reuses the existing organization-need intake. */}
      <div className={`${cardClass} border-dashed`} data-testid="pricing-plan-individual">
        <p className="font-mono text-meta uppercase tracking-label text-text-muted">
          {t("individual.name")}
        </p>
        <p className="mt-2 text-sm text-text-secondary">{t("individual.tagline")}</p>
        <p className="mt-5 text-sm font-semibold leading-snug text-text-primary">
          {t("individual.question")}
        </p>
        <p className="mt-3 flex-1 text-sm text-text-secondary">{t("individual.body")}</p>
        <div className="mt-6">
          <Link
            href="/company-need"
            className="text-sm font-semibold text-brand-blue hover:underline"
            data-testid="pricing-cta-individual"
          >
            {t("individual.cta")}
          </Link>
        </div>
      </div>
    </section>
  );
}
