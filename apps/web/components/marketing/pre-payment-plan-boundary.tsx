import { getTranslations } from "next-intl/server";

import {
  PRE_PAYMENT_PLANS,
  type FeatureKey,
  type PlanAccessState,
  type PlanCta,
} from "@/lib/billing/plans";
import { limitFor, planIncludes } from "@/lib/billing/entitlements";
import {
  FEATURE_ENFORCEMENT,
  PRICING_READINESS_STATE,
} from "@/lib/billing/readiness";

/**
 * Honest, in-product plan boundary (Stage 8; CR train WAGON 4 clarity pass).
 * Shows what each plan WILL include when payments are later enabled — with an
 * explicit "payment not enabled — request pilot access" state. No checkout, no
 * price claim, no money.
 *
 * DERIVED FROM THE REGISTRY, NEVER HAND-WRITTEN (guard-pinned by
 * lib/guards/billing-readiness.test.ts): the per-plan feature list is mapped
 * from `plan.entitlements` in lib/billing/plans.ts and each feature's
 * availability chip comes from FEATURE_ENFORCEMENT in lib/billing/readiness.ts
 * — so the rendered boundary cannot drift from the enforced boundary, and no
 * phantom feature can be claimed. i18n supplies only the LABELS, keyed by the
 * same FeatureKey set (set-equality guarded).
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

      {/* Free-today explainer (WAGON 4): what is free NOW, what the prepared
          paid boundaries are, and what "prepared, not purchasable" means. */}
      <div
        className="mt-6 grid gap-3 md:grid-cols-3"
        data-testid="plan-boundary-free-today"
      >
        <div className="card-border p-4">
          <p className="font-mono text-[10px] uppercase tracking-label text-state-success">
            {t("freeToday.freeTitle")}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-text-secondary">
            {t("freeToday.free")}
          </p>
        </div>
        <div className="card-border p-4">
          <p className="font-mono text-[10px] uppercase tracking-label text-brand-blue">
            {t("freeToday.paidTitle")}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-text-secondary">
            {t("freeToday.paid")}
          </p>
        </div>
        <div className="card-border p-4">
          <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {t("freeToday.preparedTitle")}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-text-secondary">
            {t("freeToday.prepared")}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {PRE_PAYMENT_PLANS.map((plan) => {
          // Registry-derived boundary: only features the plan actually
          // declares (boolean true or limit > 0). `false` entries (e.g.
          // priority_visibility on worker_plus) are never claimed.
          const features = (
            Object.keys(plan.entitlements) as FeatureKey[]
          ).filter((key) => planIncludes(plan, key));

          return (
            <div
              key={plan.slug}
              className="card-border flex flex-col gap-3 p-5"
              data-plan-slug={plan.slug}
              data-plan-audience={plan.audience}
            >
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

              <div>
                <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                  {t("featuresLabel")}
                </p>
                <ul
                  className="mt-2 flex flex-col gap-1.5"
                  data-features-from="plans-registry"
                >
                  {features.map((key) => {
                    const limit = limitFor(plan, key);
                    const enforcement = FEATURE_ENFORCEMENT[key];
                    return (
                      <li
                        key={key}
                        className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-xs text-text-secondary"
                      >
                        <span>
                          {t(`features.${key}` as never)}
                          {limit !== null && (
                            <span className="text-text-muted">
                              {" "}
                              · {t("limitValue", { count: limit })}
                            </span>
                          )}
                        </span>
                        <span className="font-mono text-[9px] uppercase tracking-label text-text-muted">
                          {t(`enforcement.${enforcement.kind}` as never)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <span className="mt-auto text-xs text-text-secondary">
                {t(`cta.${plan.cta as PlanCta}` as never)}
              </span>
            </div>
          );
        })}
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
