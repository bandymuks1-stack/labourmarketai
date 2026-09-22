import { getTranslations } from "next-intl/server";

import { getBillingConfig } from "@/lib/billing/config";
import { getEffectiveEntitlements } from "@/lib/billing/effective-entitlements";
import { findBillingCustomer } from "@/lib/billing/customer-store";
import { BillingPortalButton } from "@/components/app/billing-portal-button";
import { TestCheckoutButton } from "@/components/marketing/test-checkout-button";
import { resolveBillingSubject } from "@/lib/billing/billing-subject";
import { ORGANIZATION_PLAN_KEY } from "@/lib/billing/plans";
import { subscriptionBlocksCheckout } from "@/lib/billing/checkout-operations-core";
import {
  awaitingProviderSync,
  classifyCheckoutReturn,
} from "@/lib/billing/checkout-return-core";
import { Card } from "@/components/ui/Card";

/**
 * Account → billing/subscription state (commercial safe-prep v1; harvested
 * from draft PR #893 and reimplemented against current main's
 * effective-entitlements + customer-store APIs).
 *
 * Three holes this closes on the account page:
 *   1. the checkout return `?billing=test_success` / `test_cancelled` /
 *      `portal_return` was produced by the billing routes and read by NOBODY —
 *      a completed test checkout landed on a page that said nothing had
 *      happened;
 *   2. the real (test) subscription row was never shown to its owner;
 *   3. there was no in-product way to reach the provider portal to cancel or
 *      update a card.
 *
 * Honesty: while billing is disabled this renders the disabled statement only —
 * no status theater, no buy button, no implied paid tier (payments stay OFF;
 * plans are draft_pricing). When the TEST chain is configured, the TEST badge
 * is always visible; a test subscription is never presented as a live one. The
 * return notice states that state syncs via the provider webhook — the
 * redirect itself never activates anything (guard-pinned).
 */
export async function AccountBillingSection({
  billingReturn,
}: {
  billingReturn?: string | null;
}) {
  const t = await getTranslations("accountBilling");
  const cfg = getBillingConfig();
  const ent = await getEffectiveEntitlements();

  const returnKind = classifyCheckoutReturn(billingReturn);
  // The success words follow the ADAPTER MODE, not the flag: `returned.success`
  // says "test-mode … no real money moved", which was rendered for a LIVE
  // success return too (measured 2026-09-22). Live gets the live sentence.
  const returnNotice =
    returnKind === "success"
      ? (cfg.testMode ? t("returned.success") : t("returned.successLive"))
      : returnKind === "cancelled"
        ? t("returned.cancelled")
        : returnKind === "portal"
          ? t("returned.portal")
          : null;

  const status = ent.subscriptionStatus ?? "none";
  const hasSubscription = ent.source === "subscription";
  // D3: the section is live for BOTH adapter states; the TEST badge only in test.
  const billingOn = cfg.state === "stripe_test" || cfg.state === "stripe_live";
  // Payments production calm v1 (owner §6, measured 2026-09-22): after a
  // paid return with NO subscription row yet (the webhook is still in
  // flight) the section used to say "No subscription" and offer the Order
  // button again. While the return says success and no row exists, the
  // button is withheld and a "syncing with the payment provider" notice
  // replaces it. UI withholding only — the flag activates nothing (P7); the
  // checkout route is untouched and still refuses a duplicate on its own.
  const syncing = awaitingProviderSync({
    billingOn,
    billingReturn,
    subscriptionStatus: ent.subscriptionStatus,
  });

  // The portal opens ONLY for a stored billing customer — never offered
  // while payments are disabled, and never a dead button.
  let portalAvailable = false;
  if (billingOn && ent.profileId) {
    const lookup = await findBillingCustomer(ent.profileId);
    portalAvailable = lookup.status === "found";
  }
  // Owner launch pricing 2026-09-05: the ONE paid plan (ORGANIZATION, €99 —
  // the figure lives in plans.price_eur_monthly, never here) is ordered HERE,
  // server-bound to the organization the person acts for with billing
  // authority; never from a public page, never for a person (PERSON stays
  // free). The route re-checks membership, plan and price before any session.
  const subject = billingOn ? await resolveBillingSubject() : null;
  // Billing safety v1: the order button is also withheld while the subject's
  // row sits in ANY billing state (incomplete / unpaid included) — the route
  // refuses those with `subscription_exists` regardless; this keeps the UI
  // honest about it. The Customer Portal is the path to fix or cancel.
  const canOrder =
    Boolean(subject && subject.subject?.type === "organization" && subject.billingAuthority) &&
    !hasSubscription &&
    !subscriptionBlocksCheckout(status) &&
    !syncing;

  return (
    <Card compact>
      <section
        data-testid="account-billing-status"
        data-billing-state={cfg.state}
        data-subscription-status={status}
      >
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-mono text-meta uppercase tracking-label text-text-muted">
          {t("title")}
        </p>
        {cfg.testMode ? (
          <span className="rounded-sm border border-state-amber/50 bg-state-amber/10 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-state-amber">
            {t("testBadge")}
          </span>
        ) : null}
      </div>

      {returnNotice ? (
        <p
          className="mt-2 rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-sm text-text-primary"
          data-testid="account-billing-return"
          data-return={billingReturn}
        >
          {returnNotice}
        </p>
      ) : null}

      {!billingOn ? (
        <p className="mt-2 text-sm leading-relaxed text-text-secondary">
          {t("disabled")}
        </p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          {hasSubscription ? (
            <>
              <p className="text-sm text-text-primary" data-testid="account-billing-plan">
                {t("planLabel")}: {ent.effectivePlanKey}
              </p>
              <p className="text-sm text-text-secondary">
                {t("statusLabel")}: {t(`status.${status}` as never)}
              </p>
              {ent.grace ? (
                <p className="text-xs text-state-warning">{t("graceNotice")}</p>
              ) : null}
            </>
          ) : (
            <>
              {syncing ? (
                <p
                  className="text-sm text-text-secondary"
                  data-testid="account-billing-syncing"
                >
                  {t("returned.syncing")}
                </p>
              ) : (
                <p className="text-sm text-text-secondary">{t("none")}</p>
              )}
              {canOrder ? (
                <div className="flex flex-col gap-1" data-testid="account-billing-order">
                  <p className="text-sm font-semibold text-text-primary">{t("subscribe.title")}</p>
                  <TestCheckoutButton
                    planKey={ORGANIZATION_PLAN_KEY}
                    labels={{ start: t("subscribe.cta"), starting: t("manage.opening"), error: t("manage.error") }}
                  />
                  <p className="text-meta text-text-muted">{t("subscribe.note")}</p>
                </div>
              ) : null}
            </>
          )}

          {portalAvailable ? (
            <>
              <BillingPortalButton
                labels={{
                  open: t("manage.open"),
                  opening: t("manage.opening"),
                  error: t("manage.error"),
                }}
              />
              <p className="text-meta text-text-muted">{t("manage.hint")}</p>
            </>
          ) : null}
        </div>
      )}
      </section>
    </Card>
  );
}
