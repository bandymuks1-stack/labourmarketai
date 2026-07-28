import { getTranslations } from "next-intl/server";

import {
  getLmcFlags,
  getLmcLiabilitySummary,
  lmcCentsToUnits,
} from "@/lib/lmc/ledger";
import { AdminLmcGrantForm } from "@/components/app/admin-lmc-grant-form";

/**
 * Admin LMC panel (commercial readiness audit v1).
 *
 * Makes the live ledger visible and usable for the first time: the real DB
 * kill-switch states (not the TS mirror), the outstanding credit liability —
 * every issued LMC is a euro of deferred revenue, and nothing measured it
 * before — and the credit-a-tester form.
 *
 * Renders honestly when the ledger cannot be read (not applied, or the caller
 * is not an admin): it states that, rather than showing zeros that look like
 * facts.
 */
export async function AdminLmcPanel({ locale }: { locale: string }) {
  const t = await getTranslations("adminLmc");
  const [flags, liability] = await Promise.all([
    getLmcFlags(),
    getLmcLiabilitySummary(),
  ]);

  const grantsEnabled =
    flags?.find((f) => f.key === "lmc_promotional_grants_enabled")?.enabled ?? false;
  const spendingEnabled =
    flags?.find((f) => f.key === "lmc_spending_enabled")?.enabled ?? false;

  return (
    <section className="flex flex-col gap-3" data-testid="admin-lmc-panel">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("title")}
        </h2>
        <p className="text-xs text-text-secondary">{t("intro")}</p>
      </header>

      {flags === null ? (
        <p
          className="card-border p-4 text-xs text-text-muted"
          data-testid="admin-lmc-unavailable"
        >
          {t("unavailable")}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2" data-testid="admin-lmc-flags">
            {flags.map((f) => (
              <span
                key={f.key}
                data-flag={f.key}
                data-enabled={String(f.enabled)}
                className={`rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-label ${
                  f.enabled
                    ? "border-state-success/50 bg-state-success/10 text-state-success"
                    : "border-ink-500 bg-ink-800/40 text-text-muted"
                }`}
              >
                {f.key} · {f.enabled ? t("on") : t("off")} · {t(`policy.${f.policy}` as never)}
              </span>
            ))}
          </div>

          {liability ? (
            <div
              className="card-border grid gap-3 p-4 sm:grid-cols-4"
              data-testid="admin-lmc-liability"
            >
              <Tile label={t("liability.outstanding")} value={`${lmcCentsToUnits(liability.outstandingCents)} LMC`} />
              <Tile label={t("liability.promotional")} value={`${lmcCentsToUnits(liability.promotionalCents)} LMC`} />
              <Tile label={t("liability.purchased")} value={`${lmcCentsToUnits(liability.purchasedCents)} LMC`} />
              <Tile label={t("liability.accounts")} value={String(liability.accounts)} />
            </div>
          ) : null}

          <p className="text-[11px] text-text-muted">{t("liability.note")}</p>

          <AdminLmcGrantForm
            locale={locale}
            enabled={grantsEnabled}
            labels={{
              email: t("grant.email"),
              amount: t("grant.amount"),
              reason: t("grant.reason"),
              campaign: t("grant.campaign"),
              expiryDays: t("grant.expiryDays"),
              key: t("grant.key"),
              submit: t("grant.submit"),
              submitting: t("grant.submitting"),
              granted: t("grant.granted"),
              replay: t("grant.replay"),
              disabledHint: t("grant.disabledHint"),
              reasons: {
                grants_disabled: t("grant.reasons.grants_disabled"),
                not_admin: t("grant.reasons.not_admin"),
                recipient_not_found: t("grant.reasons.recipient_not_found"),
                invalid_amount: t("grant.reasons.invalid_amount"),
                invalid_expiry: t("grant.reasons.invalid_expiry"),
                idempotency_conflict: t("grant.reasons.idempotency_conflict"),
                ledger_absent: t("grant.reasons.ledger_absent"),
                error: t("grant.reasons.error"),
              },
            }}
          />

          {!spendingEnabled ? (
            <p className="text-[11px] text-text-muted" data-testid="admin-lmc-spend-frozen">
              {t("spendFrozen")}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {label}
      </span>
      <span className="font-display text-sm text-text-primary">{value}</span>
    </div>
  );
}
