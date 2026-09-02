import { getTranslations } from "next-intl/server";

import { getBillingConfig } from "@/lib/billing/config";
import { getEffectiveEntitlements } from "@/lib/billing/effective-entitlements";
import { findBillingCustomer } from "@/lib/billing/customer-store";
import { BillingPortalButton } from "@/components/app/billing-portal-button";
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

  const returnNotice =
    billingReturn === "test_success" || billingReturn === "success"
      ? t("returned.success")
      : billingReturn === "test_cancelled" || billingReturn === "cancelled"
        ? t("returned.cancelled")
        : billingReturn === "portal_return"
          ? t("returned.portal")
          : null;

  const status = ent.subscriptionStatus ?? "none";
  const hasSubscription = ent.source === "subscription";
  // D3: the section is live for BOTH adapter states; the TEST badge only in test.
  const billingOn = cfg.state === "stripe_test" || cfg.state === "stripe_live";

  // The portal opens ONLY for a stored billing customer — never offered
  // while payments are disabled, and never a dead button.
  let portalAvailable = false;
  if (billingOn && ent.profileId) {
    const lookup = await findBillingCustomer(ent.profileId);
    portalAvailable = lookup.status === "found";
  }

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
            <p className="text-sm text-text-secondary">{t("none")}</p>
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
