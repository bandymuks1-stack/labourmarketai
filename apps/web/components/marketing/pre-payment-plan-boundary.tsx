import { getTranslations } from "next-intl/server";

import { PRE_PAYMENT_PLANS, type PlanAccessState, type PlanCta } from "@/lib/billing/plans";
import { PRICING_READINESS_STATE } from "@/lib/billing/readiness";

/**
 * Honest, in-product plan boundary (Stage 8). Shows what each plan WILL include
 * when payments are later enabled — with an explicit "payment not enabled —
 * request pilot access" state. No checkout, no price claim, no money. Reads the
 * single source of truth in lib/billing/plans.ts.
 */

const ACCESS_TONE: Record<PlanAccessState, string> = {
  free: "border-state-success/40 bg-state-success/5 text-state-success",
  payment_not_enabled: "border-brand-blue/40 bg-brand-blue/5 text-brand-blue",
  internal: "border-ink-500 bg-ink-800/40 text-text-muted",
};

export async function PrePaymentPlanBoundary() {
  const t = await getTranslations("planBoundary");

  return (
    <section
      className="mx-auto max-w-container px-6 pb-20 sm:px-12"
      data-testid="plan-boundary"
    >
      <h2 className="font-display text-2xl font-bold tracking-tightest text-text-primary">
        {t("title")}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">
        {t("subcopy")}
      </p>
      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {PRE_PAYMENT_PLANS.map((plan) => (
          <div key={plan.slug} className="card-border flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-display text-base font-semibold text-text-primary">
                {t(`plans.${plan.slug}` as never)}
              </span>
              <span
                className={`rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-label ${ACCESS_TONE[plan.accessState]}`}
              >
                {t(`access.${plan.accessState}` as never)}
              </span>
            </div>
            <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              {t(`audience.${plan.audience}` as never)}
            </p>
            <span className="mt-auto text-xs text-text-secondary">
              {t(`cta.${plan.cta as PlanCta}` as never)}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[11px] text-text-muted">{t("note")}</p>
      {/* Owner-editable pricing readiness — plans stay prepared, not
          purchasable, in BOTH states (payments are off by kill-switch). */}
      <p
        className="mt-1 text-[11px] text-text-muted"
        data-testid="plan-boundary-readiness"
        data-state={PRICING_READINESS_STATE}
      >
        {t(`readiness.${PRICING_READINESS_STATE}` as never)}
      </p>
    </section>
  );
}
