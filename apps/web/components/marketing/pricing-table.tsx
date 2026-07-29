import { getLocale, getTranslations } from "next-intl/server";
import { Placeholder } from "@/components/ui/Placeholder";
import { WaitlistModal } from "@/components/marketing/waitlist-modal";
import { getPlans, PLAN_SLUGS } from "@/lib/marketing/plans";
import { PRICING_READINESS_STATE } from "@/lib/billing/readiness";

export async function PricingTable() {
  const t = await getTranslations("pricing");
  const locale = await getLocale();
  const rows = await getPlans(); // null if Supabase unreachable in preview

  return (
    <section className="mx-auto grid max-w-container gap-6 px-6 pb-16 sm:px-12 lg:grid-cols-4">
      {PLAN_SLUGS.map((slug) => {
        const row = rows?.find((r) => r.slug === slug);
        const dbName = locale === "lt" ? row?.name_lt : row?.name_en;
        const name = dbName ?? t(`plans.${slug}.name`);
        const features = t.raw(`plans.${slug}.features`) as string[];

        return (
          <div key={slug} className="flex flex-col card-border p-6">
            <p className="font-mono text-meta uppercase tracking-label text-text-muted">
              {name}
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              {t(`plans.${slug}.tagline`)}
            </p>
            <div className="mt-5 font-display text-xl font-bold tracking-tightest text-text-primary">
              <Placeholder id={`pricing.plan.${slug}`} />
            </div>
            {/* Honest price-readiness note exactly where a price would show
                (CR WAGON 4): reuses the owner-editable readiness state from
                lib/billing/readiness.ts — never a purchasable claim. */}
            <p
              className="mt-1 text-meta text-text-muted"
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
              <WaitlistModal
                trigger={t("planCta")}
                source={`pricing_${slug}`}
                triggerClassName="text-sm font-semibold text-text-primary"
              />
            </div>
          </div>
        );
      })}
    </section>
  );
}
