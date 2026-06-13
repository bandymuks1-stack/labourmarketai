import { getTranslations } from "next-intl/server";

import { getBillingConfig } from "@/lib/billing/config";

/**
 * Billing status banner (Stripe sprint PR7) — the single, honest source of the
 * pricing page's payment state. Three states, never a misleading live claim:
 *   1. disabled        → payments not enabled; request pilot access;
 *   2. stripe_test     → TEST mode (internal testing); no real money;
 *   3. stripe_live_blocked → live is hard-blocked (safety), shown as such.
 * Future live copy is prepared but inactive — no live checkout until sign-off.
 */
export async function BillingStatusBanner() {
  const cfg = getBillingConfig();
  const t = await getTranslations("billingStatus");

  const tone =
    cfg.state === "stripe_test"
      ? "border-state-amber/50 bg-state-amber/10 text-state-amber"
      : cfg.state === "stripe_live_blocked"
        ? "border-state-danger/50 bg-state-danger/10 text-state-danger"
        : "border-ink-500 bg-ink-800/40 text-text-secondary";

  return (
    <section className="mx-auto max-w-container px-6 pt-6 sm:px-12" data-testid="billing-status-banner">
      <div
        className={`flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 ${tone}`}
        data-state={cfg.state}
      >
        <span className="rounded-sm border border-current/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-label">
          {t(`badge.${cfg.state}` as never)}
        </span>
        <span className="text-xs">{t(`body.${cfg.state}` as never)}</span>
      </div>
      <p className="mt-2 text-[11px] text-text-muted">{t("futureLive")}</p>
    </section>
  );
}
