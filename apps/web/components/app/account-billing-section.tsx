import { getTranslations } from "next-intl/server";

import { getBillingConfig } from "@/lib/billing/config";
import { getEffectiveEntitlements } from "@/lib/billing/effective-entitlements";
import { LMC_SPENDING_ENABLED } from "@/lib/billing/lmc-flags";
import { getMyLmcBalance, lmcCentsToUnits } from "@/lib/lmc/ledger";
import { BillingPortalButton } from "@/components/app/billing-portal-button";

/**
 * Account → subscription state (commercial readiness audit v1).
 *
 * Three holes this closes on the account page:
 *   1. the checkout return `?billing=test_success` / `test_cancelled` was
 *      produced by the checkout route and read by NOBODY — a buyer came back
 *      from the provider to a page that said nothing had happened;
 *   2. the real subscription row was never shown to its owner;
 *   3. there was no way to cancel or update a card from inside the product.
 *
 * Honesty: while billing is disabled this renders the disabled statement only —
 * no status, no button, no implied paid tier. When it is active, the TEST-mode
 * badge is always visible; a test subscription is never presented as a live one.
 */
export async function AccountBillingSection({
  billingReturn,
}: {
  billingReturn?: string | null;
}) {
  const t = await getTranslations("accountBilling");
  const cfg = getBillingConfig();
  const ent = await getEffectiveEntitlements();
  // Own balance only (RLS-scoped). The spend kill-switch is read from the
  // guard-pinned code mirror: a normal user cannot read lmc_settings, and a
  // fail-closed DB read would claim "frozen" even after it is switched on.
  const credit = await getMyLmcBalance();
  const spendingEnabled: boolean = LMC_SPENDING_ENABLED;

  const returnNotice =
    billingReturn === "test_success"
      ? t("returned.success")
      : billingReturn === "test_cancelled"
        ? t("returned.cancelled")
        : billingReturn === "portal_return"
          ? t("returned.portal")
          : null;

  const status = ent.subscriptionStatus ?? "none";
  const hasSubscription = ent.source === "subscription";
  const periodEnd = ent.currentPeriodEnd ? ent.currentPeriodEnd.slice(0, 10) : null;

  return (
    <section
      className="card-border p-5"
      data-testid="account-billing-status"
      data-billing-state={cfg.state}
      data-subscription-status={status}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-mono text-[11px] uppercase tracking-label text-text-muted">
          {t("title")}
        </p>
        {cfg.state === "stripe_test" ? (
          <span className="rounded-sm border border-state-amber/50 bg-state-amber/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-state-amber">
            {t("testBadge")}
          </span>
        ) : null}
      </div>

      {returnNotice ? (
        <p
          className="mt-2 text-sm text-text-primary"
          data-testid="account-billing-return"
        >
          {returnNotice}
        </p>
      ) : null}

      {cfg.state !== "stripe_test" ? (
        <p className="mt-2 text-sm text-text-secondary">{t("disabled")}</p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          {hasSubscription ? (
            <>
              <p className="text-sm text-text-primary">
                {t("planLabel")}: {ent.effectivePlanKey}
              </p>
              <p className="text-sm text-text-secondary">
                {t("statusLabel")}: {t(`status.${status}` as never)}
              </p>
              {periodEnd ? (
                <p className="text-xs text-text-muted">
                  {t("periodEnd", { date: periodEnd })}
                </p>
              ) : null}
              {ent.cancelAtPeriodEnd ? (
                <p className="text-xs text-state-warning">
                  {t("cancelAtPeriodEnd")}
                </p>
              ) : null}
              {ent.grace ? (
                <p className="text-xs text-state-warning">{t("graceNotice")}</p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-text-secondary">{t("none")}</p>
          )}

          {ent.canManageBilling ? (
            <>
              <BillingPortalButton
                labels={{
                  open: t("manage.open"),
                  opening: t("manage.opening"),
                  error: t("manage.error"),
                }}
              />
              <p className="text-[11px] text-text-muted">{t("manage.hint")}</p>
            </>
          ) : null}
        </div>
      )}

      {/* Platform credit is independent of the payment provider: a tester can
          hold LMC while payments are still off. Shown only when a real balance
          exists — never a zero-balance wallet that implies a feature. */}
      {credit && credit.availableCents > 0 ? (
        <div
          className="mt-4 border-t border-ink-500/60 pt-3"
          data-testid="account-lmc-credit"
          data-lmc-available-cents={credit.availableCents}
        >
          <p className="font-mono text-[11px] uppercase tracking-label text-text-muted">
            {t("credit.title")}
          </p>
          <p className="mt-1 text-sm text-text-primary">
            {t("credit.amount", { amount: lmcCentsToUnits(credit.availableCents) })}
          </p>
          {!spendingEnabled ? (
            <p className="mt-1 text-xs text-state-warning">{t("credit.frozen")}</p>
          ) : null}
          {credit.expiredRemainderCents > 0 ? (
            <p className="mt-1 text-xs text-text-muted">
              {t("credit.expiring", {
                amount: lmcCentsToUnits(credit.expiredRemainderCents),
              })}
            </p>
          ) : null}
          <p className="mt-1 text-[11px] text-text-muted">{t("credit.note")}</p>
        </div>
      ) : null}
    </section>
  );
}
