import { getTranslations } from "next-intl/server";

import {
  PLAN_CATALOGUE_V2,
  formatEurMonthlyCents,
  type PlanV2,
  type PlanV2Audience,
} from "@/lib/billing/plans";
import {
  FIRST_ANNUAL_DISCOUNT_DEADLINE_ISO,
  FIRST_ANNUAL_DISCOUNT_PERCENT,
  LAUNCH_OFFER_VALID_UNTIL_ISO,
} from "@/lib/billing/offers";
import { inactiveAdProducts } from "@/lib/billing/ad-products";
import { WaitlistModal } from "@/components/marketing/waitlist-modal";

/**
 * Pricing catalogue V2 (Sprint v2 §9) — the owner-confirmed price table in
 * three audience columns (persons / companies / agencies).
 *
 * HONESTY (§18, guarded by lib/guards/pricing-v2-honesty.test.ts):
 *   - prices come from the typed catalogue in lib/billing/plans.ts (single
 *     source of truth, exactness pinned by tests) — never free-text i18n;
 *   - payments are OFF: the banner says activation is being prepared, and
 *     the only CTA is the real waitlist/contact flow (posts to /api/waitlist)
 *     — no fake buy button, no purchase affordance of any kind;
 *   - the Launch Offer card shows its real validity (2026-10-31) and the
 *     automatic 15% first-annual discount rule from lib/billing/offers.ts;
 *   - ad products render ONLY as an "in preparation" list while inactive —
 *     names, no prices (owner has not confirmed ad prices).
 */

const AUDIENCES: readonly PlanV2Audience[] = ["person", "company", "agency"];

export async function PricingCatalogueV2() {
  const t = await getTranslations("pricingV2");
  const preparedAdProducts = inactiveAdProducts();

  return (
    <section
      className="mx-auto max-w-container px-6 pb-16 sm:px-12"
      data-testid="pricing-catalogue-v2"
    >
      {/* Honest payments state — activation is an owner gate, nothing is charged. */}
      <div
        className="mb-8 rounded-md border border-state-amber/40 bg-state-amber/10 px-4 py-3"
        data-testid="pricing-v2-payments-state"
      >
        <p className="font-mono text-[10px] uppercase tracking-label text-state-amber">
          {t("paymentsState.badge")}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-text-secondary">
          {t("paymentsState.body")}
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {AUDIENCES.map((audience) => (
          <div key={audience} className="flex flex-col gap-4">
            <h2 className="font-display text-xl font-bold tracking-tightest text-text-primary">
              {t(`audiences.${audience}` as never)}
            </h2>
            {PLAN_CATALOGUE_V2.filter((p) => p.audience === audience).map(
              (plan) => (
                <PlanCard key={plan.slug} plan={plan} />
              ),
            )}
          </div>
        ))}
      </div>

      {/* Ad products — ARCHITECTURE in preparation; names only, no prices. */}
      {preparedAdProducts.length > 0 ? (
        <div className="mt-12" data-testid="pricing-v2-ad-products-preparing">
          <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {t("adProducts.badge")}
          </p>
          <h2 className="mt-1 font-display text-lg font-semibold text-text-primary">
            {t("adProducts.title")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">
            {t("adProducts.note")}
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {preparedAdProducts.map((p) => (
              <li
                key={p.slug}
                className="rounded-md border border-dashed border-ink-500 px-3 py-1.5 text-xs text-text-secondary"
                data-ad-product={p.slug}
              >
                {t(`adProducts.items.${p.slug}` as never)}
                <span className="ml-2 font-mono text-[9px] uppercase tracking-label text-text-muted">
                  {t("adProducts.preparing")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

async function PlanCard({ plan }: { plan: PlanV2 }) {
  const t = await getTranslations("pricingV2");
  const features = t.raw(`plans.${plan.slug}.features`) as string[];
  const highlighted = plan.launchOffer;

  return (
    <div
      className={`flex flex-col p-6 ${
        highlighted
          ? "rounded-lg border-2 border-brand-orange bg-brand-orange/5"
          : "card-border"
      }`}
      data-plan-v2={plan.slug}
    >
      {highlighted ? (
        <p className="mb-2 inline-flex w-fit rounded-sm border border-brand-orange/60 bg-brand-orange/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-brand-orange">
          {t("launchOffer.badge")}
        </p>
      ) : null}

      <p className="font-mono text-[11px] uppercase tracking-label text-text-muted">
        {t(`plans.${plan.slug}.name` as never)}
      </p>
      <p className="mt-2 text-sm text-text-secondary">
        {t(`plans.${plan.slug}.tagline` as never)}
      </p>

      <div className="mt-5 flex items-baseline gap-1.5">
        <span className="font-display text-2xl font-bold tracking-tightest text-text-primary">
          {plan.priceMonthlyCents === 0
            ? t("free")
            : formatEurMonthlyCents(plan.priceMonthlyCents)}
        </span>
        {plan.priceMonthlyCents > 0 ? (
          <span className="text-sm text-text-muted">{t("perMonth")}</span>
        ) : null}
      </div>

      {highlighted ? (
        <div className="mt-3 flex flex-col gap-1.5 rounded-md border border-brand-orange/30 bg-ink-800/20 p-3">
          <p className="text-xs leading-relaxed text-text-secondary">
            {t("launchOffer.validUntil", {
              date: LAUNCH_OFFER_VALID_UNTIL_ISO,
            })}
          </p>
          <p className="text-xs leading-relaxed text-text-secondary">
            {t("launchOffer.discountNote", {
              percent: FIRST_ANNUAL_DISCOUNT_PERCENT,
              activateBy: LAUNCH_OFFER_VALID_UNTIL_ISO,
              annualBy: FIRST_ANNUAL_DISCOUNT_DEADLINE_ISO,
            })}
          </p>
        </div>
      ) : null}

      <ul className="mt-5 flex flex-1 flex-col gap-2 text-sm text-text-secondary">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <span
              aria-hidden
              className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                highlighted ? "bg-brand-orange" : "bg-brand-blue"
              }`}
            />
            {f}
          </li>
        ))}
      </ul>

      <div className="mt-6 flex flex-col gap-1.5">
        {plan.accessState === "free" ? (
          <span className="text-sm font-semibold text-state-success">
            {t("ctaFree")}
          </span>
        ) : (
          <>
            {/* Real waitlist/contact flow (posts to /api/waitlist) — the
                honest CTA while payment activation is being prepared. */}
            <WaitlistModal
              trigger={t("cta")}
              source={`pricing_v2_${plan.slug}`}
              triggerClassName="text-sm font-semibold text-text-primary"
            />
            <span className="text-[11px] text-text-muted">
              {t("ctaNote")}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
