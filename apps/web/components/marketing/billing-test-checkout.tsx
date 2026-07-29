import { getTranslations } from "next-intl/server";

import { getBillingConfig } from "@/lib/billing/config";
import { PRE_PAYMENT_PLANS } from "@/lib/billing/plans";
import { testPriceIdFor } from "@/lib/billing/prices";
import { TestCheckoutButton } from "@/components/marketing/test-checkout-button";

/**
 * Billing test-checkout block (Stripe sprint PR3). Renders ONLY when billing is
 * in a valid Stripe TEST config — otherwise nothing (no "Pay now" for the public
 * without the flag). Carries a clear TEST-mode badge and never promises real
 * money. Each paid plan shows a test-checkout button only if its test price is
 * configured.
 */
export async function BillingTestCheckout() {
  const cfg = getBillingConfig();
  if (cfg.state !== "stripe_test") return null;

  const t = await getTranslations("billingTest");
  const paidPlans = PRE_PAYMENT_PLANS.filter(
    (p) => p.accessState === "payment_not_enabled" && testPriceIdFor(p.slug),
  );
  if (paidPlans.length === 0) return null;

  return (
    <section
      className="mx-auto max-w-container px-6 pb-12 sm:px-12"
      data-testid="billing-test-checkout"
    >
      <div className="card-border flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-sm border border-state-amber/50 bg-state-amber/10 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-state-amber">
            {t("badge")}
          </span>
          <h2 className="font-display text-lg font-semibold text-text-primary">
            {t("title")}
          </h2>
        </div>
        <p className="text-xs text-text-secondary">{t("body")}</p>
        <div className="flex flex-wrap gap-4">
          {paidPlans.map((p) => (
            <div key={p.slug} className="flex flex-col gap-1">
              <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                {p.slug}
              </span>
              <TestCheckoutButton
                planKey={p.slug}
                labels={{
                  start: t("start"),
                  starting: t("starting"),
                  error: t("error"),
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
