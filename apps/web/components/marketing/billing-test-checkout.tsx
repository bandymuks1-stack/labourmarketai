import { getTranslations } from "next-intl/server";

import { getBillingConfig } from "@/lib/billing/config";
import { planRequiresOrganization } from "@/lib/billing/checkout-core";
import { PRE_PAYMENT_PLANS } from "@/lib/billing/plans";
import { testPriceIdFor } from "@/lib/billing/prices";
import { TestCheckoutButton } from "@/components/marketing/test-checkout-button";
import { BillingPortalButton } from "@/components/marketing/billing-portal-button";

/**
 * Billing test-checkout block (Stripe sprint PR3; extended by Stripe TEST
 * subscriptions v1). Renders ONLY when billing is in a valid Stripe TEST
 * config — otherwise nothing (no "Pay now" for the public without the flag).
 * Carries a clear TEST-mode badge and never promises real money. Each paid
 * plan shows a test-checkout button only if its test price is configured;
 * company/agency plans expose an optional explicit organization id (the
 * server verifies membership either way). The Customer Portal button opens
 * the caller's OWN stored TEST customer only.
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
          <span className="rounded-sm border border-state-amber/50 bg-state-amber/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-state-amber">
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
              <span className="font-mono text-[11px] uppercase tracking-label text-text-muted">
                {p.slug}
              </span>
              <TestCheckoutButton
                planKey={p.slug}
                requiresOrg={planRequiresOrganization(p.audience)}
                labels={{
                  start: t("start"),
                  starting: t("starting"),
                  error: t("error"),
                  orgPlaceholder: t("orgPlaceholder"),
                }}
              />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-1 border-t border-ink-600 pt-3">
          <span className="font-mono text-[11px] uppercase tracking-label text-text-muted">
            {t("portal.title")}
          </span>
          <p className="text-xs text-text-secondary">{t("portal.body")}</p>
          <BillingPortalButton
            labels={{
              open: t("portal.open"),
              opening: t("portal.opening"),
              error: t("error"),
            }}
          />
        </div>
      </div>
    </section>
  );
}
